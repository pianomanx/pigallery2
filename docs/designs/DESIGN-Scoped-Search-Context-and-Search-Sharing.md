# PiGallery2 Design: Projection Search Context, Search Sharing, and User-level Allow/Blacklist

Author: Junie (JetBrains autonomous programmer)
Date: 2025-08-13
Status: Updated after maintainer clarifications

Terminology: The project uses the term projection. Earlier drafts and filenames may still say “projected”; whenever you see “projected,” read it as “projection.” Benchmark file names keep “projected” for historical reasons.

## Overview
This document proposes a design to support:
- Search-based sharing: a share link represents a pre-filtered view of the gallery.
- User-level allow AND blacklist via search query: a user’s session is constrained by an allow list and/or deny list expressed as search filters.

Both features depend on a common capability: a “projection” that prefilters the whole gallery and propagates to all dependent features (directories, persons, counts, covers, etc.). The solution must be efficient on low-end devices (e.g., Raspberry Pi), support ~10 concurrent users, and up to ~100 concurrent sharings.

Maintainer decisions incorporated:
- User supports both allow and blacklist via search query.
- Path-based sharing is removed; sharing a path must be expressed as a strict directory search query.
- Covers for a projection are selected by recursively scanning the directory and all descendants for the best matching media, and the selected cover must be persisted in the DB per projection.
- Prefer DB persistence for caching derived/aggregated values; avoid in-memory caches where possible. The DB acts as the cache; media files are the source of truth.
- The UI search query (search bar) is NOT part of the Projection Context. Apply it only to media listing/search; derived aggregates (covers, persons) ignore it. User Allow/Blacklist and Share projection always apply.
- UI filters are local-only (filter.service.ts) and never travel to the backend; do not include them in backend projection.
- SQLite and MySQL must be supported.

## Current Architecture Summary (as observed)
- Database/ORM: TypeORM. Entities live under src/backend/model/database/enitites/ (typo in folder name).
- Core entities impacted by projection:
  - MediaEntity (base), PhotoEntity, VideoEntity
  - DirectoryEntity: holds derived fields mediaCount, oldestMedia, youngestMedia, validCover, cover
  - PersonEntry with PersonJunctionTable: person counts and sample face derived from present media
  - FileEntity: meta files (markdown/gpx/pg2conf)
  - SharingEntity: currently path-based sharing with optional password and expiry
  - album/SavedSearchEntity: persistent named searches
- Search logic is encapsulated in SearchManager, which builds complex TypeORM queries from a SearchQueryDTO. It implements:
  - Multiple query primitives (text, people, rating, resolution, date ranges, orientation, etc.)
  - Query flattening and combination helpers (AND/OR/SomeOf)

## Requirements
1. Search sharing
   - Generate a link that encapsulates a search query (or references a saved search).
   - Guest session is restricted to the pre-filtered subset of media and derived aggregates (directories, persons, counts, covers).
   - Path-based shares are deprecated/removed; to share a folder use a strict directory search query (see below).
2. User allow and blacklist via query
   - A per-user static filter AllowQuery and/or DenyQuery expressed in the same query language.
   - Effective user projection = AllowQuery AND NOT DenyQuery.
3. Common: All derived values must reflect the projection
   - Directory inferred values (mediaCount, youngest/oldestMedia, cover) must be computed with respect to projection.
   - Persons list, person counts, sample faces must only include media within projection.
   - Prefer DB-persisted caches for derived values.
4. Scale targets: ~10 users, up to 100 sharings.

## Entity Dependencies on Photos (Media)
- DirectoryEntity depends on MediaEntity for:
  - mediaCount
  - oldestMedia, youngestMedia (timestamps from contained media)
  - cover, validCover
- PersonEntry depends on PersonJunctionTable which references MediaEntity (face regions are tied to specific media). PersonEntry.count and sampleRegion are derived from available media.
- SavedSearchEntity references a SearchQueryDTO (JSON). Its results are entirely dependent on the set of Media.
- SharingEntity will be extended to hold a searchQuery (JSON). Share content depends on Media and the query.
- FileEntity (meta) is not directly dependent on Photos, but its availability in a directory often tracks the presence of media.

## Design
### 1) Projection Context (Projection-based Search Context)
Introduce a request-level object that represents the effective filter for the session, called ProjectionContext. It is computed from the following inputs:
- UserProjection: AllowQuery AND NOT DenyQuery (if configured for the user)
- ShareProjection: Share.searchQuery (if present)

EffectiveProjection = UserProjection AND ShareProjection

Notes:
- Local UI filters (frontend/filter.service.ts) and the UI search bar query are client-only for transient listing and must not be included in ProjectionContext or its caches.

Representation:
- ProjectionContext.raw: the three inputs
- ProjectionContext.effective: a canonicalized, flattened SearchQueryDTO usable by SearchManager
- ProjectionContext.signature (projectionKey): a stable hash (e.g., SHA-256) of the canonicalized effective query. Used as a cache key, persisted with aggregates.

Integration patterns (two viable implementations):
A. Filtered repositories (injection-based)
- Provide wrapper Repository/Manager for Media, Directory, Person that automatically injects base predicates into QueryBuilder calls.

B. Projection Query Builders (composition-based)
- Provide ProjectionQB factory:
  - getFilteredMediaQB(): SelectQueryBuilder<MediaEntity>
  - getFilteredDirectoryQB(): SelectQueryBuilder<DirectoryEntity> (joins to filtered media)
  - getFilteredPersonsQB(): SelectQueryBuilder<PersonEntry> (joins PersonJunctionTable -> filtered media)
- Managers receive ProjectionContext and must obtain QBs from the factory.

Given PiGallery2’s current QueryBuilder-heavy approach in SearchManager, approach B is recommended initially (lower-risk, incremental). We can adopt A later if desired.

Implementation detail: Query reuse
- Build the base filtered media subquery once per request: baseFMQ = SearchManager.prepareAndBuildWhereQuery(ProjectionContext.effective)
- Reuse baseFMQ as a subquery/CTE in subsequent directory/person queries to ensure consistency and minimize re-parsing.

### 2) Derived/Inferred Values under a Projection (Persisted)
For projection views we compute per-projection values and persist them in DB as cache tables keyed by ProjectionContext.signature (projectionKey). Client DTOs MUST be composed by merging:
- Base (unprojected) entity data: directory/album name, path, ids, etc.
- Projection aggregates: item counts, oldest/youngest timestamps, and cover.

Deprecation note: Existing unprojected derived columns on DirectoryEntity (mediaCount, oldestMedia, youngestMedia, validCover, cover) should no longer be used by readers. New code paths must consume projection caches. A follow-up migration can drop these columns once all reads are updated.

Proposed cache entities (SQLite and MySQL compatible):
- ProjectionDirectoryCacheEntity (merged: directory aggregates + cover)
  - projectionKey TEXT (hash of canonicalized effective query)
  - directoryId INT (FK -> DirectoryEntity)
  - mediaCount INT
  - oldestMedia BIGINT (nullable)
  - youngestMedia BIGINT (nullable)
  - coverMediaId INT (nullable, FK -> MediaEntity)
  - projectionCoverValid BOOLEAN DEFAULT 0
  - Unique(projectionKey, directoryId)
- ProjectionAlbumCacheEntity (album aggregates + cover)
  - projectionKey TEXT
  - albumId INT (FK -> AlbumBaseEntity)
  - itemCount INT
  - oldestMedia BIGINT (nullable)
  - youngestMedia BIGINT (nullable)
  - coverMediaId INT (nullable, FK -> MediaEntity)
  - projectionCoverValid BOOLEAN DEFAULT 0
  - Unique(projectionKey, albumId)
- ProjectionPersonAggEntity
  - projectionKey TEXT
  - personId INT (FK -> PersonEntry)
  - count INT
  - sampleRegionId INT (nullable, FK -> PersonJunctionTable)
  - Unique(projectionKey, personId)

Computation strategy
- On read: try cache row(s) for the given projectionKey; if missing, compute via aggregated SQL using baseFMQ and upsert rows.
- We avoid global content-version-based invalidation. Instead, use targeted invalidation:
  - When a directory’s content changes and DirectoryEntity.validCover is reset, also reset projectionCoverValid = 0 for that directory across all projection rows.
  - When media is added/removed in a directory, lazily recompute that directory’s ProjectionDirectoryCacheEntity row on next access (upsert overwrites).
- Upsert mechanics:
  - SQLite: INSERT INTO ... ON CONFLICT(projectionKey, directoryId) DO UPDATE SET ...
  - MySQL: INSERT ... ON DUPLICATE KEY UPDATE ... (with a composite unique index)

### 3) Cover Selection (Recursive) and Persistence
- Selection rule: For a given directory D and projection, search for best matching media in D and all of its subdirectories recursively.
- Ranking: Use Config.AlbumCover.Sorting. Prefer media from D itself over descendants where applicable (as currently implemented with CASE sorting), then apply sorting.
- Persistence: Upsert into ProjectionDirectoryCacheEntity for (projectionKey, directoryId) with coverMediaId and set projectionCoverValid = 1. This avoids recomputing on subsequent reads.
- Fallback: If no media found, persist coverMediaId = NULL and projectionCoverValid = 1 to avoid repeated scans (still keyed by projectionKey).
- Invalidation: Reuse the existing cover invalidation semantics at directory-level. When a directory (or its subtree) content changes and DirectoryEntity.validCover is reset, also reset projectionCoverValid = 0 for the affected directory rows across projections. Avoid global invalidation.

### 4) Search Sharing (Path removed; strict directory share)
Schema changes
- SharingEntity: remove path; add non-nullable searchQuery (TEXT with JSON transformer).
- A “share a path” use-case is expressed as a strict directory search query:
  - { type: SearchQueryTypes.directory, text: FullDirectoryPath, matchType: exact_match }
  - FullDirectoryPath means DirectoryEntity.path + DirectoryEntity.name (the unique directory path in PiGallery2).
- Backward compatibility/migration: Existing path-based shares should be migrated by creating equivalent directory-exact searchQuery records.

API
- POST /api/share: accepts { searchQuery, password?, valid } only. No path parameter.
- GET using sharingKey establishes ShareProjection from the stored searchQuery.

Security
- sharingKey remains unguessable; password/expiry unchanged.

### 5) User-level Allow AND Blacklist via Search Query
Schema extension
- UserEntity: add allowQuery (nullable TEXT JSON), denyQuery (nullable TEXT JSON).
- Effective user projection: allowQuery AND NOT denyQuery; if allowQuery is null, it means TRUE (unrestricted); if denyQuery is null, it means FALSE (no deny).

Operational notes
- Load and attach these queries at login to construct ProjectionContext for each request.

### 6) Combining Projections and Precedence
- User projection: Allow AND NOT Deny
- Share projection: Share.searchQuery

EffectiveProjection = UserProjection ∧ ShareProjection

### 7) Performance Considerations (Raspberry Pi friendly)
- Prefer single aggregated SQL queries per view over iterative per-entity fetches.
- Reuse the base filtered media subquery in all aggregations to avoid duplicative parsing and planning.
- Ensure indices exist on common predicates:
  - Media: directoryId, creationDate, rating, orientation, resolution
  - PersonJunctionTable: mediaId, personId
  - DirectoryEntity: parentId, path, name
- Add indices/unique constraints for cache tables on (projectionKey, directoryId)/(projectionKey, personId).
- For SQLite: GLOB-based path recursion is already in use; for MySQL use LIKE prefix as implemented today.

### 8) Invalidation Strategy
- No time-based cleanup on projection caches. Do not depend on updatedAt/TTL or content-version keys.
- Explicit invalidation only:
  - When a directory’s content changes and DirectoryEntity.validCover is reset, also reset projectionCoverValid = 0 for that directory across all projection rows (ProjectionDirectoryCacheEntity).
  - Directory aggregates and album aggregates are recomputed lazily on next read: perform the aggregate query and upsert the row for the given projectionKey and entity id (overwrite existing values).
  - Person aggregates are recomputed lazily on demand similarly.
- The only periodic cleanup remains existing expired sharing deletion (unchanged).

### 9) API/Code Integration Plan
- Introduce ProjectionContext builder utility that:
  1) Canonicalizes, flattens, AND-combines UserProjection and ShareProjection
  2) Builds the base filtered media subquery via SearchManager
  3) Exposes projectionKey (signature) for cache tables
  4) Note: UI searchQueryDTO is NOT part of ProjectionContext; apply it separately to media listing/search only (never included in projectionKey).
- Update managers to:
  - Read from cache tables by projectionKey; if miss, compute and upsert.
  - Use recursive cover selection when populating ProjectionDirectoryCacheEntity.
- Server endpoints that accept a searchQueryDTO from the UI apply it only to media listing/search; do NOT include it in ProjectionContext or projectionKey.
- Sharing routes: accept only searchQuery; remove path parameter(s).
- User sessions: load user’s allow/deny at login and use for ProjectionContext.

### 10) Testing Strategy
- Unit tests for ProjectionContext combination and canonicalization.
- Integration tests:
  - Directory listing under a projection: counts, oldest/youngest, covers reflect only filtered media and are persisted in caches.
  - Persons list under a projection: set membership and counts correct; persisted.
  - Search sharing: guest views match query, unauthorized media excluded; strict directory shares behave non-recursively.
  - User allow/deny: ensure deny overrides, and effective results equal Allow AND NOT Deny.
- Performance tests on low-spec environment settings, validating response times under target concurrency with modest dataset.

### 11) Migration Considerations
- Path removal in SharingEntity:
  - Add searchQuery column (TEXT JSON) and drop path.
  - Migrate existing rows: for each share(path=p), write searchQuery = directory-exact query for p.
- Add cache tables: ProjectionDirectoryCacheEntity, ProjectionAlbumCacheEntity, and ProjectionPersonAggEntity, and indices. Add composite unique index on PersonJunctionTable(mediaId, personId) to avoid duplicates and improve joins.
- Optional follow-up migration: drop unprojected derived columns from DirectoryEntity (mediaCount, oldestMedia, youngestMedia, validCover, cover) once all reads use projection caches; client DTOs will continue to merge base identity with projection aggregates, remaining transparent to the client.

### 12) PersonJunctionTable and Person Queries
- Current schema: PersonJunctionTable has id (PK), and ManyToOne relations to MediaEntity (media) and PersonEntry (person), both indexed. This supports joins in both directions.
- Use cases supported:
  - List all persons under a projection: join pj -> media (filtered by baseFMQ) -> group by pj.personId, count rows; optionally pick a sampleRegionId from pj linked media in-projection.
  - List all photos for a given person under a projection: join pj on pj.personId = :id; join media; filter by baseFMQ; select media.
- Recommendations:
  - Add a composite UNIQUE index on (mediaId, personId) to prevent accidental duplicates and improve planner efficiency.
  - Ensure single-column indices on mediaId and personId (already present via @Index on relations in the entity).
  - No additional schema changes are required; coordinates of faces remain in MediaEntity.metadata.faces (JSON), while PersonEntry.sampleRegion can continue referencing a pj row.
- SearchManager notes:
  - Person text search currently relies on Media.metadata.persons (simple-array) and personsLength for min/max. This can remain for text search performance. Aggregations (person lists, counts) should use the junction table joined to the filtered media set for correctness under a projection.

## Appendix: Pseudocode Snippets

Build ProjectionContext (exclude UI search query; exclude local UI filters):
```
function buildProjectionContext(user, sharing): ProjectionContext {
  const allowQ = user.allowQuery ?? TRUE;
  const denyQ = user.denyQuery ? NOT(user.denyQuery) : TRUE;
  const userProj = AND(allowQ, denyQ);
  const shareQ = sharing?.searchQuery ?? TRUE;
  const effective = AND(userProj, shareQ);
  const canonical = canonicalize(flatten(effective));
  const projectionKey = hash(canonical);
  return { raw: {allowQ, denyQ, shareQ}, effective: canonical, signature: projectionKey };
}
```

Recursive cover for a directory and projection (simplified TypeORM-ish):
```
const fmSubQ = searchManager.prepareAndBuildWhereQuery(projection.effective);
const q = repo.createQueryBuilder('media')
  .innerJoin('media.directory', 'directory')
  .where(/* directory.id == dirId OR directory.path under dir path, DB-specific */)
  .andWhere(`media.id IN (${fmSubQ.getQuery()})`)
  .select(['media.id'])
  .orderBy(`CASE WHEN directory.id = :dirId THEN 0 ELSE 1 END`, 'ASC')
  .setParameters({ dirId })
  /* then apply Config.AlbumCover.Sorting */
  .limit(1);
const coverMedia = await q.getOne();
UPSERT ProjectionDirectoryCacheEntity(projectionKey, dirId) SET coverMediaId = (coverMedia?.id || NULL), projectionCoverValid = 1;
```

Directory aggregates (persisted on miss):
```
const fmSubQ = ...;
const agg = await repo.createQueryBuilder('directory')
  .leftJoin(MediaEntity, 'fm', 'fm.directoryId = directory.id')
  .andWhere(`fm.id IN (${fmSubQ.getQuery()})`)
  .select('directory.id', 'directoryId')
  .addSelect('COUNT(fm.id)', 'mediaCount')
  .addSelect('MIN(fm.metadata.creationDate)', 'oldestMedia')
  .addSelect('MAX(fm.metadata.creationDate)', 'youngestMedia')
  .groupBy('directory.id')
  .getRawMany();
UPSERT all rows into ProjectionDirectoryCacheEntity with projectionKey;
```

Persons under a projection (persisted on miss):
```
const fmSubQ = ...;
const rows = await repo.createQueryBuilder('p')
  .leftJoin(PersonJunctionTable, 'pj', 'pj.personId = p.id')
  .leftJoin(MediaEntity, 'm', 'm.id = pj.mediaId')
  .andWhere(`m.id IN (${fmSubQ.getQuery()})`)
  .select('p.id', 'personId')
  .addSelect('COUNT(pj.id)', 'count')
  .groupBy('p.id')
  .getRawMany();
UPSERT rows into ProjectionPersonAggEntity with projectionKey;
```

---
End of document.


## Appendix: Projection Cache Schema Benchmark (Denormalized vs Normalized projectionKey)

Purpose
- Compare two designs for projection-cache tables used by the EffectiveProjection caching approach:
  - Variant A (current in doc): cache tables store projectionKey TEXT directly with composite unique keys.
  - Variant B (alternative): separate ProjectionKey table (unique key hash), projection tables reference it via projectionId (FK ON DELETE CASCADE).

Benchmark harness
- Location: benchmark\\projected-cache-bench.ts (historical filename)
- Run: npm run bench:projected-cache
- Params (env vars): BENCH_SCOPES, BENCH_DIRS, BENCH_PERSONS, BENCH_LOOKUPS. Example (Windows cmd):
  - set BENCH_SCOPES=20&&set BENCH_DIRS=120&&set BENCH_PERSONS=90&&set BENCH_LOOKUPS=1000&&npm run bench:projected-cache
- DB: temporary SQLite file at db\\projected_bench.sqlite (does not touch app DB)
- Measures: upsert throughput for dir/person tables, lookup latency by (projection, directory), cascade delete performance, file size delta.

Sample results (SQLite, N=20, D=120, P=90, lookups=1000)
- Insert/Upsert
  - A.upsert ProjDirA: 188.79 ms
  - A.upsert ProjPersonA: 101.38 ms
  - B.upsert ProjDirB: 203.97 ms (~+8%)
  - B.upsert ProjPersonB: 117.96 ms (~+16%)
- Lookup (find one by projection + directory)
  - A.lookup ProjDirA: 268.46 ms
  - B.lookup ProjDirB: 798.40 ms (~3x)
- Deletion
  - A.delete projection rows by projectionKey (2 tables): 89.12 ms
  - B.delete ProjectionKey rows (cascade): 48.90 ms (~45% faster)
- File size delta: 0 bytes (SQLite files do not shrink without VACUUM).

Notes and interpretation
- Normalizing projection keys (Variant B) significantly improves deletion/invalidation thanks to ON DELETE CASCADE (single delete on ProjectionKey), supporting our targeted invalidation strategy.
- Writes (upserts) are modestly slower with normalization on this dataset.
- Lookups in Variant B were slower in this run; likely factors:
  - ORM overhead when referencing relation columns.
  - Need to ensure composite unique index on (projectionId, directoryId) is used by queries. The benchmark defines a composite UNIQUE which should create an index; however, query-path differences (QueryBuilder vs Repository) can influence timings.
  - For fairness, align query shapes and add an explicit @Index(["projection", "directoryId"]) if needed; also consider prepared statements.
- MySQL not measured here; normalization tends to pay off further with larger datasets and cascading cleanups. The harness can be extended to a MySQL DataSource if desired.

Recommendation (initial)
- If fast and simple invalidation across many projections is a priority, prefer Variant B (ProjectionKey + FK cascade) and ensure:
  - Composite unique index on (projectionId, directoryId) and (projectionId, personId).
  - Query by both columns to leverage the index.
- If lookup performance dominates and invalidation is infrequent, Variant A may be slightly faster in SQLite.
- Given PiGallery2’s need to invalidate many projection rows cheaply (covers and aggregates), Variant B looks favorable, provided we optimize lookups and add proper indices. The benchmark harness is now available to iterate on these optimizations.


## Implementation Plan (Variant A: projectionKey TEXT)

Decision
- We will implement projection caches using Variant A: projectionKey stored as TEXT in cache tables with composite unique indices. This aligns with maintainer preference (“keeping projectionKey: text”) and provides good lookup performance and simpler code paths. The earlier benchmark remains in the appendix for reference; we may revisit normalization (Variant B) later if invalidation complexity grows.

Audience
- This plan is written so a junior engineer can follow it step by step. Each task lists files to touch, acceptance criteria, and notes.

High-level milestones
1) Schema: add projection cache tables (directory aggregates + cover merged, person aggregates).  
2) Projection builder: construct EffectiveProjection and projectionKey.  
3) Cache compute & read‑through: populate caches on demand using SearchManager.  
4) Invalidation: reuse existing cover invalidation; add targeted resets for projection caches.  
5) Sharing/User projection: move share to searchQuery; wire user allow/deny.  
6) Managers integration: Gallery and Person readers consume caches.  
7) Tests and rollout.

Prerequisites
- Node v22 (per engines), local DB (SQLite default) available.  
- Ability to run npm scripts: npm run build-backend, npm run test-backend.  
- Familiarity with TypeORM entities and QueryBuilder (see SearchManager.ts for patterns).

Task 1: Add new cache entities (schema)
- Files to create:
  - src\\backend\\model\\database\\enitites\\cache\\ProjectionDirectoryCacheEntity.ts
  - src\\backend\\model\\database\\enitites\\cache\\ProjectionAlbumCacheEntity.ts
  - src\\backend\\model\\database\\enitites\\cache\\ProjectionPersonAggEntity.ts
- Content (fields and constraints):
  - ProjectionDirectoryCacheEntity
    - projectionKey: TEXT (indexed)
    - directoryId: INT, FK -> DirectoryEntity (indexed)
    - mediaCount: INT
    - oldestMedia: BIGINT nullable
    - youngestMedia: BIGINT nullable
    - coverMediaId: INT nullable, FK -> MediaEntity
    - projectionCoverValid: BOOLEAN DEFAULT 0
    - Unique(projectionKey, directoryId)
  - ProjectionAlbumCacheEntity
    - projectionKey: TEXT (indexed)
    - albumId: INT, FK -> AlbumBaseEntity (indexed)
    - itemCount: INT
    - oldestMedia: BIGINT nullable
    - youngestMedia: BIGINT nullable
    - coverMediaId: INT nullable, FK -> MediaEntity
    - projectionCoverValid: BOOLEAN DEFAULT 0
    - Unique(projectionKey, albumId)
  - ProjectionPersonAggEntity
    - projectionKey: TEXT (indexed)
    - personId: INT, FK -> PersonEntry (indexed)
    - count: INT
    - sampleRegionId: INT nullable, FK -> PersonJunctionTable
    - Unique(projectionKey, personId)
- Integration:
  - Add all new entities to SQLConnection.getEntries() list so TypeORM can create tables.
- Acceptance criteria:
  - Running the app with synchronize=false and schemeSync flow creates the tables in SQLite/MySQL without errors (dev DB).

Task 2: Build ProjectionContext utility (EffectiveProjection and projectionKey)
- Files to create:
  - src\\backend\\model\\ProjectionContext.ts
- Responsibilities:
  - Inputs: user.allowQuery, user.denyQuery, sharing.searchQuery; exclude local UI filters and the UI search bar query.
  - Combine as EffectiveProjection = AND(Allow, NOT(Deny), Share).
  - Canonicalize/flatten queries (reuse SearchManager.flattenSameOfQueries where possible; keep stable ordering of AND/OR lists).
  - Compute projectionKey = SHA‑256 of canonicalized EffectiveProjection JSON string.
  - Expose helper to obtain base filtered media Brackets via SearchManager.prepareAndBuildWhereQuery(EffectiveProjection).
- Acceptance criteria:
  - Unit tests cover: combining inputs, stability of projectionKey for semantically identical trees, exclusion of local UI filters and the UI search bar query.

Task 3: Projection cache read‑through and upsert (Directory & Albums)
- Files to create:
  - src\\backend\\model\\database\\ProjectionCacheManager.ts (new manager)
- Responsibilities (directory side):
  - getDirectoryAggregates(projectionKey, dirIds[]): read rows from ProjectionDirectoryCacheEntity; for misses, compute aggregates via a single aggregated query using base filtered media subquery, then upsert rows (ON CONFLICT/ON DUPLICATE KEY).
  - getAndPersistProjectionCover(projectionKey, directory): compute cover by recursively scanning directory + descendants with EffectiveProjection (reuse CoverManager sorting/rules), then upsert coverMediaId and set projectionCoverValid=1. If no media found, persist NULL with projectionCoverValid=1.
- Responsibilities (album side):
  - getAlbumAggregates(projectionKey, albumIds[]): for each album, compute itemCount/oldest/youngest by querying Media with EffectiveProjection AND album.searchQuery (intersection); upsert into ProjectionAlbumCacheEntity.
  - getAndPersistProjectionAlbumCover(projectionKey, album): compute best cover with EffectiveProjection AND album.searchQuery (reuse CoverManager.getCoverForAlbum logic with extra filter); upsert coverMediaId and set projectionCoverValid=1 (or NULL with projectionCoverValid=1 if no match).
- SQL patterns:
  - SQLite: INSERT INTO ... ON CONFLICT(projectionKey, directoryId|albumId) DO UPDATE SET ...
  - MySQL: INSERT ... ON DUPLICATE KEY UPDATE ...
- Acceptance criteria:
  - Given a projection, repeated calls for the same directory/album return cached rows without recomputing; first call computes and persists.

Task 4: Projection cache read‑through and upsert (Persons)
- Extend ProjectionCacheManager with:
  - getPersonsAggregates(projectionKey): list persons and counts within projection by joining PersonJunctionTable -> MediaEntity filtered by EffectiveProjection; upsert rows into ProjectionPersonAggEntity.
  - Optionally compute a sampleRegionId per person from an in‑projection face.
- Acceptance criteria:
  - Listing persons under a projection yields correct counts; second call hits cache.

Task 5: Invalidation and maintenance
- Directory cover invalidation:
  - When DirectoryEntity.validCover is reset (existing logic), also execute: UPDATE ProjectionDirectoryCacheEntity SET projectionCoverValid = 0 WHERE directoryId IN (affected dirs).
- Media add/remove in a directory:
  - No global invalidation. On next read, aggregates recompute and overwrite via upsert (lazy refresh).
- Acceptance criteria:
  - After adding/removing media in a directory, subsequent requests recompute aggregates on demand; projection cover recomputes once projectionCoverValid=0.

Task 6: Sharing changes (path removed; strict directory query)
- Update DTOs (already present in src\\common\\entities\\SharingDTO.ts to include searchQuery). Ensure backend aligns:
  - src\\backend\\model\\database\\enitites\\SharingEntity.ts: remove path; add @Column('text', transformer: JSON<->SearchQueryDTO>) searchQuery.
  - src\\backend\\middlewares\\SharingMWs.ts: accept only { searchQuery, password, valid } in create/update; remove path; validation updated.
  - src\\backend\\model\\database\\SharingManager.ts: persist searchQuery; drop path logic.
  - src\\backend\\middlewares\\user\\AuthenticationMWs.ts: on share login, set session user allowList = sharing.searchQuery.
- Migration:
  - For existing path shares, create equivalent directory‑exact SearchQuery and store to new column; drop path column.
- Acceptance criteria:
  - Creating and fetching shares works with searchQuery only; “share a path” is done by providing a strict directory search query.

Task 7: User allow AND blacklist
- Extend UserEntity (backend):
  - Add allowQuery (TEXT JSON, nullable), denyQuery (TEXT JSON, nullable).
- Session wiring:
  - At login, load these fields and pass to ProjectionContext builder.
- Acceptance criteria:
  - EffectiveProjection = Allow AND NOT Deny reflected in results; null means unrestricted/none as specified.

Task 8: Managers integration
- GalleryManager:
  - When listing directories, use ProjectionCacheManager.getDirectoryAggregates() with current projectionKey to populate projection counts and times for visible directories.
  - For subdirectory tiles, call getAndPersistProjectionCover() if projectionCoverValid=0 or missing.
- Albums:
  - Album list/detail endpoints should use ProjectionCacheManager.getAlbumAggregates() and getAndPersistProjectionAlbumCover() to populate itemCount/oldest/youngest and cover per projection.
- CoverManager:
  - Expose a method to get recursive cover with an optional EffectiveProjection Brackets; used by ProjectionCacheManager.
- Person listing endpoints:
  - Use ProjectionCacheManager.getPersonsAggregates() instead of ad‑hoc counts.
- Acceptance criteria:
  - Directory/album/person views reflect projection aggregates; performance remains acceptable on Raspberry Pi targets.

Task 9: PersonJunctionTable index improvement
- Add composite UNIQUE index on (mediaId, personId) in PersonJunctionTable to prevent duplicates and speed joins.
- Acceptance criteria:
  - Schema contains the composite UNIQUE; queries using joins show stable performance.

Task 10: Testing
- Unit tests:
  - ProjectionContext building and hashing stability.
- Integration tests:
  - Directory listing under a projection: counts/oldest/youngest/cover reflect only filtered media and persist.
  - Person list under a projection: counts correct; persisted.
  - Share flow: searchQuery‑only shares function; strict directory share works.
  - User allow/deny: deny overrides; EffectiveProjection applies.
- Performance check:
  - On sample dataset, verify latency does not regress; optional use of the existing benchmark harness.

Task 11: Deployment and rollback
- Bump DataStructureVersion if existing schemeSync requires it to create new tables; verify no destructive resets in production. If risk exists, prepare a backup/migration plan.
- Feature flags:
  - Optionally guard projection cache usage with a config flag to allow quick rollback to non‑projection behavior.
- Rollback path:
  - If issues arise, disable projection caches (flag) and keep existing global behavior while investigating.

Checklist (Definition of Done)
- [ ] New cache entities exist and are registered.
- [ ] ProjectionContext utility builds EffectiveProjection and provides projectionKey.
- [ ] ProjectionCacheManager computes and upserts directory aggregates and covers.
- [ ] Persons aggregates persisted and served from cache.
- [ ] Invalidation hooks wired to existing cover invalidation and directory changes.
- [ ] Sharing uses searchQuery only; path removed; migration path documented.
- [ ] User allow/deny supported and included in EffectiveProjection.
- [ ] Managers consume projection caches; views reflect projection results.
- [ ] Tests added and passing; basic performance verified on low‑spec device.

Notes
- Keep paths Windows‑style (e.g., src\\backend\\model\\database\\enitites\\...).  
- For MySQL, ensure the composite UNIQUE indices exist and use VARCHAR for TEXT columns if needed for index limitations.

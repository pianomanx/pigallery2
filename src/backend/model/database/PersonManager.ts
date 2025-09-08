import {SQLConnection} from './SQLConnection';
import {PersonEntry} from './enitites/PersonEntry';
import {PersonDTO} from '../../../common/entities/PersonDTO';
import {Logger} from '../../Logger';
import {SQL_COLLATE} from './enitites/EntityUtils';
import {PersonJunctionTable} from './enitites/PersonJunctionTable';
import {IObjectManager} from './IObjectManager';
import {ParentDirectoryDTO} from '../../../common/entities/DirectoryDTO';
import {ProjectedPersonCacheEntity} from './enitites/ProjectedPersonCacheEntity';
import {SessionContext} from '../SessionContext';

const LOG_TAG = '[PersonManager]';

export class PersonManager implements IObjectManager {
  personsCache: Record<string, PersonEntry[]> = null;

  private static async updateCounts(): Promise<void> {
    const connection = await SQLConnection.getConnection();
    await connection.query(
      'UPDATE person_entry SET count = ' +
      ' (SELECT COUNT(1) FROM person_junction_table WHERE person_junction_table.personId = person_entry.id)'
    );

    // remove persons without photo
    await connection
      .createQueryBuilder()
      .delete()
      .from(PersonEntry)
      .where('count = 0')
      .execute();
  }

  private static async updateSamplePhotos(): Promise<void> {
    const connection = await SQLConnection.getConnection();
    await connection.query(
      'update person_entry set sampleRegionId = ' +
      '(Select person_junction_table.id from  media_entity ' +
      'left join person_junction_table on media_entity.id = person_junction_table.mediaId ' +
      'where person_junction_table.personId=person_entry.id ' +
      'order by media_entity.metadataRating desc, ' +
      'media_entity.metadataCreationdate desc ' +
      'limit 1)'
    );
  }

  private async updateCacheForAll(session: SessionContext): Promise<void> {
    const connection = await SQLConnection.getConnection();
    const projectionKey = session.user.projectionKey;

    // Get all persons that need cache updates (either missing or invalid)
    const personsNeedingUpdate = await connection
      .getRepository(PersonEntry)
      .createQueryBuilder('person')
      .leftJoin(
        ProjectedPersonCacheEntity,
        'cache',
        'cache.person = person.id AND cache.projectionKey = :projectionKey',
        {projectionKey}
      )
      .where('cache.id IS NULL OR cache.valid = false')
      .getMany();

    if (personsNeedingUpdate.length === 0) {
      return;
    }

    // Process persons in batches to avoid memory issues
    const batchSize = 200;
    for (let i = 0; i < personsNeedingUpdate.length; i += batchSize) {
      const batch = personsNeedingUpdate.slice(i, i + batchSize);
      const personIds = batch.map(p => p.id);

      // Build base query for person junction table with projection constraints
      const baseQb = connection
        .getRepository(PersonJunctionTable)
        .createQueryBuilder('pjt')
        .innerJoin('pjt.media', 'media')
        .where('pjt.person IN (:...personIds)', {personIds});

      // Apply projection query if it exists
      if (session.projectionQuery) {
        baseQb.andWhere(session.projectionQuery);
      }

      // Compute counts per person
      const countResults = await baseQb
        .clone()
        .select(['pjt.person as personId', 'COUNT(*) as count'])
        .groupBy('pjt.person')
        .getRawMany();

      // Compute sample regions per person (best rated/newest photo)
      // Use individual queries per person to ensure compatibility with older SQLite versions
      const topSamples: Record<number, number> = {};
      for (const personId of personIds) {
        const sampleQb = connection
          .getRepository(PersonJunctionTable)
          .createQueryBuilder('pjt')
          .innerJoin('pjt.media', 'media')
          .where('pjt.person = :personId', {personId});

        // Apply projection query if it exists
        if (session.projectionQuery) {
          sampleQb.andWhere(session.projectionQuery);
        }

        const sampleResult = await sampleQb
          .select('pjt.id')
          .orderBy('media.metadataRating', 'DESC')
          .addOrderBy('media.metadataCreationdate', 'DESC')
          .limit(1)
          .getOne();

        if (sampleResult) {
          topSamples[personId] = sampleResult.id;
        }
      }

      // Build count lookup
      const counts = countResults.reduce((acc: Record<number, number>, r: any) => {
        acc[parseInt(r.personId, 10)] = parseInt(r.count, 10);
        return acc;
      }, {});

      // Batch upsert cache entries to minimize DB transactions
      const cacheRepo = connection.getRepository(ProjectedPersonCacheEntity);
      const cacheEntriesToSave: ProjectedPersonCacheEntity[] = [];

      // Get existing cache entries for this batch
      const existingEntries = await cacheRepo
        .createQueryBuilder('cache')
        .where('cache.projectionKey = :projectionKey', {projectionKey})
        .andWhere('cache.person IN (:...personIds)', {personIds})
        .getMany();

      const existingByPersonId = existingEntries.reduce((acc, entry) => {
        acc[entry.person.id] = entry;
        return acc;
      }, {} as Record<number, ProjectedPersonCacheEntity>);

      for (const person of batch) {
        const count = counts[person.id] || 0;
        const sampleRegionId = topSamples[person.id] || null;

        let cacheEntry = existingByPersonId[person.id];
        if (cacheEntry) {
          // Update existing entry
          cacheEntry.count = count;
          cacheEntry.sampleRegion = sampleRegionId ? {id: sampleRegionId} as any : null;
          cacheEntry.valid = true;
        } else {
          // Create new entry
          cacheEntry = new ProjectedPersonCacheEntity();
          cacheEntry.projectionKey = projectionKey;
          cacheEntry.person = {id: person.id} as any;
          cacheEntry.count = count;
          cacheEntry.sampleRegion = sampleRegionId ? {id: sampleRegionId} as any : null;
          cacheEntry.valid = true;
        }

        cacheEntriesToSave.push(cacheEntry);
      }

      // Batch save all cache entries for this batch
      if (cacheEntriesToSave.length > 0) {
        await cacheRepo.save(cacheEntriesToSave);
      }
    }
  }


  async updatePerson(
    name: string,
    partialPerson: PersonDTO
  ): Promise<PersonEntry> {
    const connection = await SQLConnection.getConnection();
    const repository = connection.getRepository(PersonEntry);
    const person = await repository
      .createQueryBuilder('person')
      .limit(1)
      .where('person.name LIKE :name COLLATE ' + SQL_COLLATE, {name})
      .getOne();

    if (typeof partialPerson.name !== 'undefined') {
      person.name = partialPerson.name;
    }
    if (typeof partialPerson.isFavourite !== 'undefined') {
      person.isFavourite = partialPerson.isFavourite;
    }
    await repository.save(person);

    await this.resetMemoryCache();

    return person;
  }

  public async getAll(session: SessionContext): Promise<PersonEntry[]> {
    if (!this.personsCache?.[session.user.projectionKey]) {
      await this.loadAll(session);
    }
    return this.personsCache[session.user.projectionKey];
  }

  /**
   * Used for statistic
   */
  public async countFaces(): Promise<number> {
    const connection = await SQLConnection.getConnection();
    return await connection
      .getRepository(PersonJunctionTable)
      .createQueryBuilder('personJunction')
      .getCount();
  }

  public async get(session: SessionContext, name: string): Promise<PersonEntry> {
    if (!this.personsCache?.[session.user.projectionKey]) {
      await this.loadAll(session);
    }
    return this.personsCache[session.user.projectionKey].find((p): boolean => p.name === name);
  }

  public async saveAll(
    persons: { name: string; mediaId: number }[]
  ): Promise<void> {
    const toSave: { name: string; mediaId: number }[] = [];
    const connection = await SQLConnection.getConnection();
    const personRepository = connection.getRepository(PersonEntry);
    const personJunction = connection.getRepository(PersonJunctionTable);

    const savedPersons = await personRepository.find();
    // filter already existing persons
    for (const personToSave of persons) {
      const person = savedPersons.find(
        (p): boolean => p.name === personToSave.name
      );
      if (!person) {
        toSave.push(personToSave);
      }
    }

    if (toSave.length > 0) {
      for (let i = 0; i < toSave.length / 200; i++) {
        const saving = toSave.slice(i * 200, (i + 1) * 200);
        // saving person
        const inserted = await personRepository.insert(
          saving.map((p) => ({name: p.name}))
        );
        // saving junction table
        const junctionTable = inserted.identifiers.map((idObj, j) => ({person: idObj, media: {id: saving[j].mediaId}}));
        await personJunction.insert(junctionTable);
      }
    }
  }

  public async onNewDataVersion(changedDir?: ParentDirectoryDTO): Promise<void> {
    await this.invalidateCacheForDir(changedDir);
  }

  protected async invalidateCacheForDir(changedDir?: ParentDirectoryDTO): Promise<void> {
    if (!changedDir || !changedDir.id) {
      return;
    }
    try {
      const connection = await SQLConnection.getConnection();

      // Collect affected person ids from this directory (non-recursive)
      const rows = await connection.getRepository(PersonJunctionTable)
        .createQueryBuilder('pjt')
        .innerJoin('pjt.media', 'm')
        .innerJoin('m.directory', 'd')
        .innerJoin('pjt.person', 'person')
        .where('d.id = :dirId', {dirId: changedDir.id})
        .select('DISTINCT person.id', 'pid')
        .getRawMany();

      const pids = rows.map((r: any) => parseInt(r.pid, 10)).filter((n: number) => !isNaN(n));
      if (pids.length === 0) {
        return;
      }

      // Mark projection-aware person cache entries invalid for these persons
      await connection.getRepository(ProjectedPersonCacheEntity)
        .createQueryBuilder()
        .update()
        .set({valid: false})
        .where('personId IN (:...pids)', {pids})
        .execute();
      this.personsCache = null;

    } catch (err) {
      Logger.warn(LOG_TAG, 'Failed to invalidate projected person cache on data change', err);
    }
  }

  private  resetMemoryCache(): void {
    this.personsCache = null;
  }

  public async resetPreviews(): Promise<void> {
    const connection = await SQLConnection.getConnection();
    await connection.getRepository(ProjectedPersonCacheEntity)
      .createQueryBuilder()
      .update()
      .set({valid: false})
      .execute();
    this.resetMemoryCache();
  }

  private async loadAll(session: SessionContext): Promise<void> {
    await this.updateCacheForAll(session);
    const connection = await SQLConnection.getConnection();
    const personRepository = connection.getRepository(PersonEntry);
    this.personsCache = this.personsCache || {};
    this.personsCache[session.user.projectionKey] = await personRepository
      .createQueryBuilder('person')
      .leftJoin('person.cache', 'cache', 'cache.projectionKey = :pk AND cache.valid = 1', {pk: session.user.projectionKey})
      .leftJoin('cache.sampleRegion', 'sampleRegion')
      .leftJoin('sampleRegion.media', 'media')
      .leftJoin('media.directory', 'directory')
      .select([
        'person.id',
        'person.name',
        'person.isFavourite',
        'cache.count',
        'sampleRegion',
        'media.name',
        'directory.path',
        'directory.name'
      ])
      .getMany();
  }

}

import {DBTestHelper} from '../../../DBTestHelper';
import {Connection} from 'typeorm';
import {ObjectManagers} from '../../../../../src/backend/model/ObjectManagers';
import {SQLConnection} from '../../../../../src/backend/model/database/SQLConnection';
import {ProjectedCacheManager} from '../../../../../src/backend/model/database/ProjectedCacheManager';
import {DirectoryEntity} from '../../../../../src/backend/model/database/enitites/DirectoryEntity';
import {ProjectedDirectoryCacheEntity} from '../../../../../src/backend/model/database/enitites/ProjectedDirectoryCacheEntity';
import {SessionManager} from '../../../../../src/backend/model/database/SessionManager';
import {DiskManager} from '../../../../../src/backend/model/fileaccess/DiskManager';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const chai = require('chai');
const {expect} = chai;

declare let describe: any;
declare const before: any;
declare const after: any;
declare const it: any;
const tmpDescribe = describe;
describe = DBTestHelper.describe();

describe('ProjectedCacheManager.invalidateDirectoryCache', (sqlHelper: DBTestHelper) => {
  describe = tmpDescribe;

  let connection: Connection;
  let pcm: any; // access protected method

  before(async () => {
    await sqlHelper.initDB();
    await sqlHelper.setUpTestGallery();
    await ObjectManagers.getInstance().init();
    connection = await SQLConnection.getConnection();
    pcm = new ProjectedCacheManager();
  });

  after(async () => {
    await sqlHelper.clearDB();
  });

  it('invalidates the given directory and all of its parents, but not descendants', async () => {
    const repoDir = connection.getRepository(DirectoryEntity);
    const repoCache = connection.getRepository(ProjectedDirectoryCacheEntity);

    // Entities from helper
    const root = sqlHelper.testGalleyEntities.dir;            // ParentDirectoryDTO of root
    const child = sqlHelper.testGalleyEntities.subDir;        // direct child of root
    const child2 = sqlHelper.testGalleyEntities.subDir2;      // another child of root

    // For descendant, use a grandchild under child (if not present, we simulate by using child itself as descendant context-wise)
    // Our sample gallery only has one level of subdirs; to test descendant unaffected, we will use subDir2 as unrelated descendant (sibling),
    // and also ensure caches under child remain valid if targeting root's child.

    // Resolve DirectoryEntity records
    const rootEnt = await repoDir.findOne({where: {name: root.name, path: root.path}});
    const childEnt = await repoDir.findOne({where: {name: child.name, path: DiskManager.pathFromParent(root)}});
    const child2Ent = await repoDir.findOne({where: {name: child2.name, path: DiskManager.pathFromParent(root)}});
    expect(rootEnt).to.not.be.null;
    expect(childEnt).to.not.be.null;
    expect(child2Ent).to.not.be.null;

    const projectionKey1 = SessionManager.NO_PROJECTION_KEY;
    const projectionKey2 = 'OTHER_PROJECTION_KEY';

    // Seed cache rows with valid=true initially for both projection keys
    const seed = async (directory: DirectoryEntity, projectionKey: string) => {
      const row = new ProjectedDirectoryCacheEntity();
      row.directory = directory as any;
      row.projectionKey = projectionKey;
      row.mediaCount = 0;
      row.valid = true;
      return repoCache.save(row);
    };

    await repoCache.createQueryBuilder().delete().from(ProjectedDirectoryCacheEntity).execute();

    const rootCache1 = await seed(rootEnt!, projectionKey1);
    const rootCache2 = await seed(rootEnt!, projectionKey2);
    const childCache1 = await seed(childEnt!, projectionKey1);
    const childCache2 = await seed(childEnt!, projectionKey2);
    const child2Cache1 = await seed(child2Ent!, projectionKey1);
    const child2Cache2 = await seed(child2Ent!, projectionKey2);

    // Target: child directory => should invalidate child and its parents (root), but not sibling (child2)
    const target = {name: child.name, path: root.path} as any; // ParentDirectoryDTO minimal

    await pcm.invalidateDirectoryCache(target);

    // Reload caches for both projection keys
    const rc1 = await repoCache.findOne({where: {id: rootCache1.id}});
    const rc2 = await repoCache.findOne({where: {id: rootCache2.id}});
    const cc1 = await repoCache.findOne({where: {id: childCache1.id}});
    const cc2 = await repoCache.findOne({where: {id: childCache2.id}});
    const c2c1 = await repoCache.findOne({where: {id: child2Cache1.id}});
    const c2c2 = await repoCache.findOne({where: {id: child2Cache2.id}});

    expect(rc1!.valid).to.equal(false, 'root (key1) should be invalidated');
    expect(rc2!.valid).to.equal(false, 'root (key2) should be invalidated');
    expect(cc1!.valid).to.equal(false, 'target child (key1) should be invalidated');
    expect(cc2!.valid).to.equal(false, 'target child (key2) should be invalidated');
    expect(c2c1!.valid).to.equal(true, 'sibling/descendant (key1) should not be invalidated');
    expect(c2c2!.valid).to.equal(true, 'sibling/descendant (key2) should not be invalidated');
  });
});

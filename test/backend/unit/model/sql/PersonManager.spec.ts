import {expect} from 'chai';
import {PersonManager} from '../../../../../src/backend/model/database/PersonManager';
import {DBTestHelper} from '../../../DBTestHelper';
import {TestHelper} from '../../../../TestHelper';
import {PhotoDTO} from '../../../../../src/common/entities/PhotoDTO';
import {Utils} from '../../../../../src/common/Utils';
import {ParentDirectoryDTO} from '../../../../../src/common/entities/DirectoryDTO';
import {VideoDTO} from '../../../../../src/common/entities/VideoDTO';
import {SQLConnection} from '../../../../../src/backend/model/database/SQLConnection';
import {PersonEntry} from '../../../../../src/backend/model/database/enitites/PersonEntry';


// to help WebStorm to handle the test cases
declare let describe: any;
declare const after: any;
declare const before: any;
declare const it: any;


// eslint-disable-next-line prefer-const
describe = DBTestHelper.describe();

describe('PersonManager', (sqlHelper: DBTestHelper) => {


  let dir: ParentDirectoryDTO;

  let v: VideoDTO;
  let p: PhotoDTO;
  let p2: PhotoDTO;
  let pFaceLess: PhotoDTO;

  let savedPerson: PersonEntry[] = [];

  const setUpSqlDB = async () => {
    await sqlHelper.initDB();
    const directory: ParentDirectoryDTO = TestHelper.getDirectoryEntry();
    p = TestHelper.getPhotoEntry1(directory);
    p2 = TestHelper.getPhotoEntry2(directory);
    const pFaceLessTmp = TestHelper.getPhotoEntry3(directory);
    delete pFaceLessTmp.metadata.faces;
    v = TestHelper.getVideoEntry1(directory);

    dir = await DBTestHelper.persistTestDir(directory);
    p = (dir.media.filter(m => m.name === p.name)[0] as any);
    p2 = (dir.media.filter(m => m.name === p2.name)[0] as any);
    pFaceLess = (dir.media[2] as any);
    v = (dir.media.filter(m => m.name === v.name)[0] as any);
    savedPerson = await (await SQLConnection.getConnection()).getRepository(PersonEntry).createQueryBuilder('person')
      .leftJoin('person.cache', 'cache', 'cache.projectionKey = :pk AND cache.valid = 1', {pk: DBTestHelper.defaultSession.user.projectionKey})
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
  };


  before(async () => {
    await setUpSqlDB();
  });

  after(async () => {
    await sqlHelper.clearDB();
  });


  it('should get person', async () => {
    const pm = new PersonManager();
    const person = Utils.clone(savedPerson[0]);

    const selected = Utils.clone(await pm.get(DBTestHelper.defaultSession, 'Boba Fett'));
    expect(selected.cache).to.be.not.undefined;
    delete selected.cache;
    delete person.cache;
    expect(selected).to.deep.equal(person);

  });


});

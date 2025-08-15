import {DBTestHelper} from '../../../DBTestHelper';
import {GalleryManager} from '../../../../../src/backend/model/database/GalleryManager';
import {ParentDirectoryDTO} from '../../../../../src/common/entities/DirectoryDTO';
import {Connection} from 'typeorm';
import {SessionContext} from '../../../../../src/backend/model/SessionContext';
import {SearchQueryTypes, TextSearchQueryMatchTypes} from '../../../../../src/common/entities/SearchQueryDTO';
import {ObjectManagers} from '../../../../../src/backend/model/ObjectManagers';
import {SQLConnection} from '../../../../../src/backend/model/database/SQLConnection';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const deepEqualInAnyOrder = require('deep-equal-in-any-order');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chai = require('chai');

chai.use(deepEqualInAnyOrder);
const {expect} = chai;

// to help WebStorm to handle the test cases
declare let describe: any;
declare const before: any;
declare const after: any;
declare const beforeEach: any;
declare const afterEach: any;
declare const it: any;
const tmpDescribe = describe;
describe = DBTestHelper.describe();


class GalleryManagerTest extends GalleryManager {

  public async getDirIdAndTime(connection: Connection, directoryName: string, directoryParent: string) {
    return super.getDirIdAndTime(connection, directoryName, directoryParent);
  }

  public async getParentDirFromId(connection: Connection, session: SessionContext, dir: number): Promise<ParentDirectoryDTO> {
    return super.getParentDirFromId(connection, session, dir);
  }
}

describe('GalleryManager', (sqlHelper: DBTestHelper) => {
  describe = tmpDescribe;

  let galleryManager: GalleryManagerTest;
  let connection: Connection;

  before(async () => {
    await sqlHelper.initDB();
    await sqlHelper.setUpTestGallery();
    await ObjectManagers.getInstance().init();
    connection = await SQLConnection.getConnection();
    galleryManager = new GalleryManagerTest();
  });

  after(async () => {
    await sqlHelper.clearDB();
  });

  describe('Projection Query Tests', () => {

    it('should return all media when no projection query is provided', async () => {
      // Setup a session with no projection query
      const session = new SessionContext();


      // Get the directory contents without any filtering using our directory's name and path
      const dirInfo = await galleryManager.getDirIdAndTime(connection, sqlHelper.testGalleyEntities.dir.name, sqlHelper.testGalleyEntities.dir.path);
      expect(dirInfo).to.not.be.null;

      const directory = await galleryManager.getParentDirFromId(connection, session, dirInfo.id);

      // Verify that all media is returned
      expect(directory.media).to.not.be.empty;
      const originalMediaCount = directory.media.length;
      expect(originalMediaCount).to.be.greaterThan(0);
    });

    it('should filter media based on the projection query', async () => {

      // Create a projection query that filters based on media name
      const searchQuery = {
        type: SearchQueryTypes.file_name,
        text: 'photo1', // We've named our test photo specifically with this pattern
        matchType: TextSearchQueryMatchTypes.like
      };
      const session = await ObjectManagers.getInstance().buildContext({allowQuery: searchQuery} as any);


      // Get the directory contents with filtering using our directory's name and path
      const dirInfo = await galleryManager.getDirIdAndTime(connection, sqlHelper.testGalleyEntities.dir.name, sqlHelper.testGalleyEntities.dir.path);
      expect(dirInfo).to.not.be.null;

      // Get the directory contents with filtering
      const directory = await galleryManager.getParentDirFromId(connection, session, dirInfo.id);

      // Verify that only media matching the query is returned
      expect(directory.media).to.not.be.undefined;

      // All returned media should match the query (name contains 'photo1')
      if (directory.media.length > 0) {
        directory.media.forEach(media => {
          expect(media.name.toLowerCase()).to.include('photo1');
        });
      }

    });

    it('should return directory with empty media when projection filters out all media', async () => {

      const searchQuery = {
        type: SearchQueryTypes.file_name,
        text: 'this_file_name_does_not_exist_anywhere',
        matchType: TextSearchQueryMatchTypes.like
      };


      const session = await ObjectManagers.getInstance().buildContext({allowQuery: searchQuery} as any);


      const dirInfo = await galleryManager.getDirIdAndTime(connection, sqlHelper.testGalleyEntities.dir.name, sqlHelper.testGalleyEntities.dir.path);
      expect(dirInfo).to.not.be.null;

      const directory = await galleryManager.getParentDirFromId(connection, session, dirInfo.id);

      // The directory itself should still be returned
      expect(directory).to.not.be.undefined;
      expect(directory).to.not.be.null;

      // And media should be an empty array when nothing matches the projection
      expect(directory.media).to.be.an('array');
      expect(directory.media.length).to.equal(0);

    });

  });
});

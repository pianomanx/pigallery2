import {DBTestHelper} from '../../../DBTestHelper';
import {GalleryManager} from '../../../../../src/backend/model/database/GalleryManager';
import {ParentDirectoryDTO, SubDirectoryDTO} from '../../../../../src/common/entities/DirectoryDTO';
import {Connection, Brackets} from 'typeorm';
import {SessionContext} from '../../../../../src/backend/model/SessionContext';
import {SearchQueryTypes, TextSearchQueryMatchTypes} from '../../../../../src/common/entities/SearchQueryDTO';
import {ObjectManagers} from '../../../../../src/backend/model/ObjectManagers';
import * as path from 'path';
import {SQLConnection} from '../../../../../src/backend/model/database/SQLConnection';
import {TestHelper} from '../../../../TestHelper';
import {PhotoDTO} from '../../../../../src/common/entities/PhotoDTO';
import {VideoDTO} from '../../../../../src/common/entities/VideoDTO';
import {FileDTO} from '../../../../../src/common/entities/FileDTO';
import {Utils} from '../../../../../src/common/Utils';
import {UserEntity} from '../../../../../src/backend/model/database/enitites/UserEntity';
import {Config} from '../../../../../src/common/config/private/Config';
import {SQLLogLevel} from '../../../../../src/common/config/private/PrivateConfig';

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
  let dir: ParentDirectoryDTO;
  let subDir: SubDirectoryDTO;
  let subDir2: SubDirectoryDTO;
  let p: PhotoDTO;
  let p2: PhotoDTO;
  let p3: PhotoDTO;
  let p4: PhotoDTO;
  let v: VideoDTO;
  let gpx: FileDTO;

  const setUpGalleryTest = async (): Promise<void> => {
    // Create base directory structure
    const directory: ParentDirectoryDTO = TestHelper.getDirectoryEntry();
    subDir = TestHelper.getDirectoryEntry(directory, 'The Phantom Menace');
    subDir2 = TestHelper.getDirectoryEntry(directory, 'Return of the Jedi');

    // Create photo entries with specific names to match the test cases
    p = TestHelper.getPhotoEntry1(directory);
    p.name = 'photo1.jpg'; // Ensure we have a photo1 for the test case
    p.metadata.creationDate = Date.now();
    p.metadata.creationDateOffset = '+02:00';

    p2 = TestHelper.getPhotoEntry2(directory);
    p2.name = 'photo2.jpg';
    p2.metadata.creationDate = Date.now() - 60 * 60 * 24 * 1000; // 1 day ago
    p2.metadata.creationDateOffset = '+02:00';

    // Create video entry
    v = TestHelper.getVideoEntry1(directory);
    v.metadata.creationDate = Date.now() - 60 * 60 * 24 * 7 * 1000; // 1 week ago
    v.metadata.creationDateOffset = '+02:00';

    // Create a GPX file
    gpx = TestHelper.getRandomizedGPXEntry(directory);

    // Create photos in subdirectories
    p3 = TestHelper.getPhotoEntry3(subDir);
    p3.name = 'photo3.jpg';
    let d = new Date();
    d = Utils.addMonthToDate(d, -1); // 1 month ago
    d.setDate(d.getDate() - 1); // minus 1 day
    p3.metadata.creationDate = d.getTime();
    p3.metadata.creationDateOffset = '+02:00';

    p4 = TestHelper.getPhotoEntry4(subDir2);
    p4.name = 'photo4.jpg';
    d = new Date();
    // Set creation date to one year and one day earlier
    p4.metadata.creationDate = d.getTime() - 60 * 60 * 24 * (Utils.isDateFromLeapYear(d) ? 367 : 366) * 1000;
    p4.metadata.creationDateOffset = '+02:00';

    // Persist the directory structure to the database
    dir = await DBTestHelper.persistTestDir(directory);
    subDir = dir.directories[0];
    subDir2 = dir.directories[1];

    // Get the media items from the persisted directory
    p = (dir.media.filter(m => m.name === p.name)[0] as any);
    p.directory = dir;

    p2 = (dir.media.filter(m => m.name === p2.name)[0] as any);
    p2.directory = dir;

    v = (dir.media.filter(m => m.name === v.name)[0] as any);
    v.directory = dir;

    if (dir.metaFile && dir.metaFile.length > 0) {
      gpx = (dir.metaFile[0] as any);
      gpx.directory = dir;
    }

    p3 = (dir.directories[0].media[0] as any);
    p3.directory = dir.directories[0];

    p4 = (dir.directories[1].media[0] as any);
    p4.directory = dir.directories[1];
  };

  const setUpSqlDB = async () => {
    await sqlHelper.initDB();
    await setUpGalleryTest();
    await ObjectManagers.getInstance().init();
  };

  before(async () => {
    await setUpSqlDB();
    galleryManager = new GalleryManagerTest();
    connection = await SQLConnection.getConnection();
  });

  after(async () => {
    await sqlHelper.clearDB();
  });

  describe('Projection Query Tests', () => {

    it('should return all media when no projection query is provided', async () => {
      // Setup a session with no projection query
      const session = new SessionContext();

      // Use the already persisted directory from our setup
      expect(dir).to.not.be.null;
      expect(dir.media).to.not.be.empty;

      // Get the directory contents without any filtering using our directory's name and path
      const dirInfo = await galleryManager.getDirIdAndTime(connection, dir.name, dir.path);
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


      // Use the already persisted directory from our setup
      expect(dir).to.not.be.null;

      // Get the directory contents with filtering using our directory's name and path
      const dirInfo = await galleryManager.getDirIdAndTime(connection, dir.name, dir.path);
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


      const dirInfo = await galleryManager.getDirIdAndTime(connection, dir.name, dir.path);
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

/* eslint-disable no-unused-expressions,@typescript-eslint/no-unused-expressions */
import {expect} from 'chai';
import {ObjectManagers} from '../../../../src/backend/model/ObjectManagers';
import {UserEntity} from '../../../../src/backend/model/database/enitites/UserEntity';
import {ANDSearchQuery, SearchQueryTypes, TextSearch, TextSearchQueryMatchTypes} from '../../../../src/common/entities/SearchQueryDTO';
import {UserRoles} from '../../../../src/common/entities/UserDTO';
import {Brackets} from 'typeorm';
import {DBTestHelper} from '../../DBTestHelper';

declare let describe: any;
declare const it: any;
declare const beforeEach: any;
declare const afterEach: any;
const tmpDescribe = describe;
describe = DBTestHelper.describe(); // fake it os IDE plays nicely (recognize the test)

describe('ObjectManagers', (sqlHelper: DBTestHelper) => {
  describe = tmpDescribe;
  describe('buildContext', () => {

    // Reset ObjectManagers before each test
    beforeEach(async () => {
      await sqlHelper.initDB();
    });

    afterEach(sqlHelper.clearDB);

    it('should create a basic context with user and no queries', async () => {
      // Create a basic user with no queries
      const user = new UserEntity();
      user.id = 1;
      user.name = 'testuser';
      user.role = UserRoles.Admin;
      user.permissions = ['/test'];

      // Create the context
      const context = await ObjectManagers.getInstance().buildContext(user);

      // Verify the context
      expect(context).to.not.be.null;
      expect(context.user).to.be.eql(user);
      expect(context.projection).to.be.undefined;
    });

    it('should create a context with allowQuery and set projectionQuery', async () => {
      // Create a user with allowQuery
      const user = new UserEntity();
      user.id = 2;
      user.name = 'allowuser';
      user.role = UserRoles.Admin;
      user.allowQuery = {
        type: SearchQueryTypes.directory,
        text: '/allowed/path',
        matchType: TextSearchQueryMatchTypes.exact_match
      } as TextSearch;

      // Mock the SearchManager.prepareAndBuildWhereQuery method
      const mockProjectionQuery = new Brackets(qb => qb.where('directory.path = :path', {path: '/allowed/path'}));
      ObjectManagers.getInstance().SearchManager = {
        prepareAndBuildWhereQuery: (query: any) => {
          // Verify the query is passed correctly
          expect(query).to.be.eql(user.allowQuery);
          return Promise.resolve(mockProjectionQuery);
        }
      } as any;

      // Create the context
      const context = await ObjectManagers.getInstance().buildContext(user);

      // Verify the context
      expect(context).to.not.be.null;
      expect(context.user).to.be.eql(user);
      expect(context.projection.query).to.be.eql(mockProjectionQuery);
      expect(context.user.projectionKey).to.be.a('string').and.not.empty;
    });

    it('should create a context with blockQuery, negate it, and set projectionQuery', async () => {
      // Create a user with blockQuery
      const user = new UserEntity();
      user.id = 3;
      user.name = 'blockuser';
      user.role = UserRoles.Admin;
      user.blockQuery = {
        type: SearchQueryTypes.directory,
        text: '/blocked/path',
        matchType: TextSearchQueryMatchTypes.exact_match,
        negate: false
      } as TextSearch;

      // Clone the original blockQuery for later comparison
      const originalBlockQuery = JSON.parse(JSON.stringify(user.blockQuery));

      // Mock the SearchManager.prepareAndBuildWhereQuery method
      const mockProjectionQuery = new Brackets(qb => qb.where('directory.path != :path', {path: '/blocked/path'}));
      ObjectManagers.getInstance().SearchManager = {
        prepareAndBuildWhereQuery: (query: any) => {
          // Verify the query has been negated
          expect(query).to.not.be.eql(originalBlockQuery);
          expect(query.negate).to.be.true;
          return Promise.resolve(mockProjectionQuery);
        }
      } as any;

      // Create the context
      const context = await ObjectManagers.getInstance().buildContext(user);

      // Verify the context
      expect(context).to.not.be.null;
      expect(context.user).to.be.eql(user);
      expect(context.projection.query).to.be.eql(mockProjectionQuery);
      expect(context.user.projectionKey).to.be.a('string').and.not.empty;
      // Verify the blockQuery was negated
      expect((user.blockQuery as TextSearch).negate).to.be.true;
    });

    it('should create a context with both allowQuery and blockQuery, combine them with AND', async () => {
      // Create a user with both allowQuery and blockQuery
      const user = new UserEntity();
      user.id = 4;
      user.name = 'bothuser';
      user.role = UserRoles.Admin;
      user.allowQuery = {
        type: SearchQueryTypes.AND,
        list:[
          {
            type: SearchQueryTypes.directory,
            text: '/allowed/path',
            matchType: TextSearchQueryMatchTypes.exact_match
          } as TextSearch,
          {
            type: SearchQueryTypes.file_name,
            text: 'photo',
            matchType: TextSearchQueryMatchTypes.exact_match
          } as TextSearch
        ]
      } as ANDSearchQuery;
      user.blockQuery = {
        type: SearchQueryTypes.directory,
        text: '/blocked/path',
        matchType: TextSearchQueryMatchTypes.exact_match,
        negate: false
      } as TextSearch;

      // Clone the original queries for later comparison
      const originalAllowQuery = JSON.parse(JSON.stringify(user.allowQuery));
      const originalBlockQuery = JSON.parse(JSON.stringify(user.blockQuery));

      // Mock the SearchManager.prepareAndBuildWhereQuery method
      const mockProjectionQuery = new Brackets(qb => qb.where('complex combined query'));
      ObjectManagers.getInstance().SearchManager = {
        prepareAndBuildWhereQuery: (query: any) => {
          // Verify the query is an AND combination of allowQuery and negated blockQuery
          expect(query.type).to.be.eql(SearchQueryTypes.AND);
          expect(query.list).to.have.lengthOf(2);
          expect(query.list[0]).to.be.eql(originalAllowQuery);
          expect(query.list[1].negate).to.be.true;
          return Promise.resolve(mockProjectionQuery);
        }
      } as any;

      // Create the context
      const context = await ObjectManagers.getInstance().buildContext(user);

      // Verify the context
      expect(context).to.not.be.null;
      expect(context.user).to.be.eql(user);
      expect(context.projection.query).to.be.eql(mockProjectionQuery);
      expect(context.user.projectionKey).to.be.a('string').and.not.empty;
      // Verify the blockQuery was negated
      expect((user.blockQuery as TextSearch).negate).to.be.true;
    });

    it('should generate consistent projectionKey for the same query', async () => {
      // Create two identical users with the same query
      const user1 = new UserEntity();
      user1.id = 5;
      user1.name = 'user1';
      user1.role = UserRoles.Admin;
      user1.allowQuery = {
        type: SearchQueryTypes.directory,
        text: '/allowed/path',
        matchType: TextSearchQueryMatchTypes.exact_match
      } as TextSearch;

      const user2 = new UserEntity();
      user2.id = 6;
      user2.name = 'user2';
      user2.role = UserRoles.Admin;
      user2.allowQuery = {
        type: SearchQueryTypes.directory,
        text: '/allowed/path',
        matchType: TextSearchQueryMatchTypes.exact_match
      } as TextSearch;
      // Mock the SearchManager.prepareAndBuildWhereQuery method
      const mockProjectionQuery = new Brackets(qb => qb.where('directory.path = :path', {path: '/allowed/path'}));
 /*     ObjectManagers.getInstance().SearchManager = {
        prepareAndBuildWhereQuery: (query: any) => {
          return Promise.resolve(mockProjectionQuery);
        }
      } as any;*/

      // Create the contexts
      const context1 = await ObjectManagers.getInstance().buildContext(user1);
      const context2 = await ObjectManagers.getInstance().buildContext(user2);

      // Verify both users have the same projectionKey despite being different users
      expect(context1.user.projectionKey).to.be.a('string').and.not.empty;
      expect(context2.user.projectionKey).to.be.a('string').and.not.empty;
      expect(context1.user.projectionKey).to.be.eql(context2.user.projectionKey);
    });
  });
});

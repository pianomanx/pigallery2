import {Config} from '../../../../src/common/config/private/Config';
import {Server} from '../../../../src/backend/server';
import {UserDTO, UserRoles} from '../../../../src/common/entities/UserDTO';
import * as fs from 'fs';
import {SQLConnection} from '../../../../src/backend/model/database/SQLConnection';
import {ObjectManagers} from '../../../../src/backend/model/ObjectManagers';
import {Utils} from '../../../../src/common/Utils';
import {SuperAgentStatic} from 'superagent';
import {RouteTestingHelper} from './RouteTestingHelper';
import {QueryParams} from '../../../../src/common/QueryParams';
import {DatabaseType} from '../../../../src/common/config/private/PrivateConfig';
import {TestHelper} from '../../../TestHelper';
import {ProjectPath} from '../../../../src/backend/ProjectPath';
import * as chai from "chai";
import {default as chaiHttp, request} from "chai-http";
import {DBTestHelper} from '../../DBTestHelper';

process.env.NODE_ENV = 'test';
chai.should();
const {expect} = chai;
chai.use(chaiHttp);

describe('PublicRouter', () => {
  const sqlHelper = new DBTestHelper(DatabaseType.sqlite);

  const testUser: UserDTO = {
    id: 1,
    name: 'test',
    password: 'test',
    role: UserRoles.User
  };
  const {password: pass, ...expectedUser} = testUser;

  let server: Server;
  const setUp = async () => {
    await sqlHelper.initDB();
    Config.Users.authenticationRequired = true;
    Config.Sharing.enabled = true;

    server = new Server(false);
    await server.onStarted.wait();

    await ObjectManagers.getInstance().init();
    await ObjectManagers.getInstance().UserManager.createUser(Utils.clone(testUser));
    await SQLConnection.close();
  };
  const tearDown = async () => {
    await sqlHelper.clearDB();
  };

  const shouldHaveInjectedUser = (result: any, user: any) => {

    result.should.have.status(200);
    result.text.should.be.a('string');
    result.body.should.deep.equal({});
    const startToken = 'ServerInject = {user:';
    const endToken = ', ConfigInject';

    const u = JSON.parse(result.text.substring(result.text.indexOf(startToken) + startToken.length, result.text.indexOf(endToken)));

    if (user == null) {
      expect(u).to.equal(null);
      return;
    }
    // Only public-safe subset is injected; ensure projectionKey is present but do not assert its value
    expect(u).to.be.an('object');
    expect(u).to.have.property('name', user.name);
    expect(u).to.have.property('role', user.role);
    expect(u).to.have.property('usedSharingKey', user.usedSharingKey);
    expect(u).to.have.property('projectionKey');
    expect(u.projectionKey).to.be.a('string').and.to.have.length.greaterThan(0);
    expect(u).to.deep.equal(user);
  };


  describe('/Get share/:' + QueryParams.gallery.sharingKey_params, () => {

    beforeEach(setUp);
    afterEach(tearDown);

    const fistLoad = async (srv: Server, sharingKey: string): Promise<any> => {
      return (request.execute(srv.Server) as SuperAgentStatic)
        .get('/share/' + sharingKey);
    };

    it('should not get default user with passworded share  without required password', async () => {
      Config.Sharing.passwordRequired = false;
      const sharing = await RouteTestingHelper.createSharing(testUser, 'secret_pass');
      const res = await fistLoad(server, sharing.sharingKey);
      shouldHaveInjectedUser(res, null);
    });

    it('should not get default user with passworded share share with required password', async () => {
      Config.Sharing.passwordRequired = true;
      const sharing = await RouteTestingHelper.createSharing(testUser, 'secret_pass');
      const res = await fistLoad(server, sharing.sharingKey);
      shouldHaveInjectedUser(res, null);
    });


    it('should get default user with no-password share', async () => {
      Config.Sharing.passwordRequired = false;
      const sharing = await RouteTestingHelper.createSharing(testUser);
      const res = await fistLoad(server, sharing.sharingKey);
      shouldHaveInjectedUser(res, RouteTestingHelper.getExpectedSharingUserForUI(sharing));
    });

  });

});

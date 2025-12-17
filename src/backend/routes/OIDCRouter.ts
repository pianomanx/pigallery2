import {Express, Request, Response, NextFunction} from 'express';
import {Config} from '../../common/config/private/Config';
import {OIDCAuthService} from '../model/auth/OIDCAuthService';

export class OIDCRouter {
  public static route(app: Express): void {
    const base = Config.Server.apiPath + '/auth/oidc';

    app.get(base + '/login', async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!Config.Users.oidc.enabled) {
          return res.status(404).end();
        }
        await OIDCAuthService.login(req, res);
      } catch (err) {
        return next(err);
      }
    });

    app.get(base + '/callback', async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!Config.Users.oidc.enabled) {
          return res.status(404).end();
        }
        await OIDCAuthService.callback(req, res);
      } catch (err) {
        return next(err);
      }
    });
  }
}

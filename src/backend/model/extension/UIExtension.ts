import {ExtensionObject} from './ExtensionObject';
import {IClientMediaButtonConfig} from '../../../common/entities/extension/IClientUIConfig';
import {UserDTO, UserRoles} from '../../../common/entities/UserDTO';
import {ParamsDictionary} from 'express-serve-static-core';
import {MediaEntity} from '../database/enitites/MediaEntity';
import {IUIExtension} from './IExtension';
import {Repository} from 'typeorm';
import {Logger} from '../../Logger';

export class UIExtension<C> implements IUIExtension<C> {
  public buttonConfigs: IClientMediaButtonConfig[] = [];

  constructor(private extensionObject: ExtensionObject<C>) {
  }

  public addMediaButton(buttonConfig: IClientMediaButtonConfig, serverSB: (params: ParamsDictionary, body: any, user: UserDTO, media: MediaEntity, repository: Repository<MediaEntity>) => Promise<void>): void {
    this.buttonConfigs.push(buttonConfig);
    // api path isn't set
    if (!buttonConfig.apiPath) {
      Logger.silly('[UIExtension]', 'Button config has no apiPath:' + buttonConfig.name);
      return;
    }
    this.extensionObject.RESTApi.post.mediaJsonResponse([buttonConfig.apiPath], buttonConfig.minUserRole || UserRoles.LimitedGuest, !buttonConfig.skipDirectoryInvalidation, serverSB);
  }
}

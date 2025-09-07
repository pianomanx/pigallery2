import {Brackets} from 'typeorm';
import {UserDTO} from '../../common/entities/UserDTO';
import {SearchQueryDTO} from '../../common/entities/SearchQueryDTO';

export class SessionContext {
  user: ContextUser;
  // New structured projection with prebuilt SQL and params
  projectionQuery?: Brackets;
  hasDirectoryProjection: boolean;
}

export interface ContextUser extends UserDTO {
  overrideAllowBlockList?: boolean;

  allowQuery?: SearchQueryDTO;

  blockQuery?: SearchQueryDTO;
}

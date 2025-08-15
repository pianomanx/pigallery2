import {Brackets} from 'typeorm';
import {UserDTO} from '../../common/entities/UserDTO';

export class SessionContext {
  user: UserDTO;
  // New structured projection with prebuilt SQL and params
  projectionQuery?: Brackets;
}

import {Brackets} from 'typeorm';
import {UserDTO} from '../../common/entities/UserDTO';

export class SessionContext {
  user: UserDTO;
  projectionQuery: Brackets;

}

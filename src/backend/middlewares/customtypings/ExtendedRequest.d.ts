/* eslint-disable @typescript-eslint/no-explicit-any */
import {LoginCredential} from '../../../common/entities/LoginCredential';
import {UserDTO} from '../../../common/entities/UserDTO';
import {SessionContext} from '../../model/SessionContext';

declare global {
  namespace Express {
    interface Request {
      resultPipe?: unknown;
      body?: {
        loginCredential?: LoginCredential;
      };
      locale?: string;
      session: {
        context?: SessionContext;
        rememberMe?: boolean;
      };
    }

    interface Response {
      tpl?: Record<string, any>;
    }

  }
}



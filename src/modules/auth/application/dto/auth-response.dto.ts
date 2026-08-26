import { Role } from '../../../../common/enums/role.enum';
import { AccountStatus } from '../../domain/enums/account-status.enum';

/** Vista publica del usuario. Nunca incluye el hash ni datos de bloqueo. */
export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: AccountStatus;
  /** GU-01 Esc. 2: el front usa esto para bloquear pedidos y reservas. */
  canOperate: boolean;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  expiresIn: string;
  /** No se serializa al cliente: viaja en una cookie httpOnly. */
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
}

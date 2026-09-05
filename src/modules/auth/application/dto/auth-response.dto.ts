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
  phone: string | null;
  city: string | null;
  profilePhotoUrl: string | null;
  assignedLocation: {
    id: string;
    name: string;
    address: string;
    status: string;
    restaurantName: string;
  } | null;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  /** Segundos de vigencia del access token (lo informa Supabase). */
  expiresIn: number;
  /** No se serializa al cliente: viaja en una cookie httpOnly. */
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
}

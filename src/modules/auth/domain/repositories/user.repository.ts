import { Role } from '../../../../common/enums/role.enum';
import { User } from '../entities/user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface CreateUserData {
  /** Id de la cuenta en Supabase Auth: public.users.id debe coincidir. */
  id: string;
  email: string;
  fullName: string;
  phone: string;
  city: string;
  /** Opcional: el registro (GU-01) ya no pide foto de perfil. */
  profilePhotoUrl?: string | null;
  role: Role;
  termsVersion: string;
  acceptedAt: Date;
}

export interface UpdateUserProfileData {
  fullName?: string;
  phone?: string | null;
  city?: string | null;
  profilePhotoUrl?: string | null;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  updateProfile(
    userId: string,
    data: UpdateUserProfileData,
  ): Promise<User | null>;
  requestAccountDeletion(
    userId: string,
    deletionRequestedAt: Date,
    deletionEffectiveAt: Date,
  ): Promise<User | null>;
  /** GU-02 Esc. 4: suma un intento fallido y bloquea al llegar al limite. */
  registerFailedLogin(
    userId: string,
    maxAttempts: number,
    lockMinutes: number,
  ): Promise<void>;
  /** Login correcto: reinicia el contador y actualiza la ultima entrada. */
  registerSuccessfulLogin(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}

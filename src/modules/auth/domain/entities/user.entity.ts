import { BaseEntity } from '../../../../common/domain/base.entity';
import { Role } from '../../../../common/enums/role.enum';
import { AccountStatus } from '../enums/account-status.enum';

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: Role;
  status: AccountStatus;
  deletionRequestedAt: Date | null;
  deletionEffectiveAt: Date | null;
  suspensionReason: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Cuenta de acceso. Concentra las reglas de negocio de GU-01 y GU-02 para que
 * no queden repartidas por los casos de uso.
 */
export class User extends BaseEntity {
  readonly email: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly role: Role;
  readonly status: AccountStatus;
  readonly deletionRequestedAt: Date | null;
  readonly deletionEffectiveAt: Date | null;
  readonly suspensionReason: string | null;
  readonly failedLoginAttempts: number;
  readonly lockedUntil: Date | null;
  readonly lastLoginAt: Date | null;

  constructor(props: UserProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.fullName = props.fullName;
    this.role = props.role;
    this.status = props.status;
    this.deletionRequestedAt = props.deletionRequestedAt;
    this.deletionEffectiveAt = props.deletionEffectiveAt;
    this.suspensionReason = props.suspensionReason;
    this.failedLoginAttempts = props.failedLoginAttempts;
    this.lockedUntil = props.lockedUntil;
    this.lastLoginAt = props.lastLoginAt;
  }

  /** GU-02 Esc. 4: bloqueo temporal vigente. */
  isTemporarilyLocked(now: Date = new Date()): boolean {
    return this.lockedUntil !== null && this.lockedUntil > now;
  }

  /** GU-02 Esc. 3: cuenta suspendida por un administrador. */
  isSuspended(): boolean {
    return this.status === AccountStatus.SUSPENDIDA;
  }

  isDisabled(): boolean {
    return this.status === AccountStatus.DESHABILITADA;
  }

  isDeletionPending(): boolean {
    return this.status === AccountStatus.PENDIENTE_ELIMINACION;
  }

  /**
   * GU-01 Esc. 2: un restaurante "pendiente de aprobacion" SI puede entrar
   * (necesita crear su perfil de negocio); son sus funciones operativas las
   * que quedan bloqueadas.
   */
  isPendingApproval(): boolean {
    return this.status === AccountStatus.PENDIENTE_APROBACION;
  }

  canOperate(): boolean {
    return this.status === AccountStatus.ACTIVA;
  }
}

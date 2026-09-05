import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { UnauthorizedError } from '../../../../common/errors/unauthorized-error';
import {
  SupabaseAuthService,
  SupabaseSession,
} from '../../../../infrastructure/auth/supabase-auth.service';
import { User } from '../../domain/entities/user.entity';
import { LOGIN_ATTEMPT_REPOSITORY } from '../../domain/repositories/login-attempt.repository';
import type { LoginAttemptRepository } from '../../domain/repositories/login-attempt.repository';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { AuthResult, PublicUser } from '../dto/auth-response.dto';
import { LoginDto } from '../dto/login.dto';

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * GU-02 - Inicio de sesion (PARCHE-170).
 *
 * Regla transversal (Esc. 2): ante credenciales invalidas la respuesta es
 * siempre la misma, sin revelar si el correo existe.
 */
const GENERIC_ERROR = 'Correo o contraseña incorrectos.';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(LOGIN_ATTEMPT_REPOSITORY)
    private readonly attempts: LoginAttemptRepository,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly config: ConfigService,
  ) {}

  async execute(dto: LoginDto, ctx: RequestContext): Promise<AuthResult> {
    const maxAttempts = this.config.get<number>('LOGIN_MAX_ATTEMPTS', 5);
    const lockMinutes = this.config.get<number>('LOGIN_LOCK_MINUTES', 15);

    const user = await this.users.findByEmail(dto.email);

    // Se llama a Supabase exista o no la cuenta localmente: si solo se hiciera
    // cuando el correo existe, el tiempo de respuesta delataria por
    // temporizacion cuales correos estan registrados (GU-02 Esc. 2).
    const session = await this.supabaseAuth.signInWithPassword(
      dto.email,
      dto.password,
    );

    if (!user) {
      await this.attempts.record({
        ...ctx,
        emailAttempted: dto.email,
        successful: false,
        failureReason: 'correo_inexistente',
      });
      throw new UnauthorizedError(GENERIC_ERROR, 'INVALID_CREDENTIALS');
    }

    // GU-02 Esc. 4: bloqueo temporal por intentos fallidos.
    if (user.isTemporarilyLocked()) {
      await this.attempts.record({
        ...ctx,
        emailAttempted: dto.email,
        userId: user.id,
        successful: false,
        failureReason: 'cuenta_bloqueada',
      });
      const minutesLeft = Math.max(
        1,
        Math.ceil((user.lockedUntil!.getTime() - Date.now()) / 60_000),
      );
      throw new ForbiddenError(
        `Demasiados intentos fallidos. Intenta de nuevo en ${minutesLeft} minuto(s).`,
        'CUENTA_BLOQUEADA',
        { minutesLeft },
      );
    }

    if (!session) {
      await this.users.registerFailedLogin(user.id, maxAttempts, lockMinutes);
      await this.attempts.record({
        ...ctx,
        emailAttempted: dto.email,
        userId: user.id,
        successful: false,
        failureReason: 'password_incorrecta',
      });
      throw new UnauthorizedError(GENERIC_ERROR, 'INVALID_CREDENTIALS');
    }

    // GU-02 Esc. 3: cuenta suspendida, con el motivo cuando exista.
    if (user.isSuspended()) {
      await this.attempts.record({
        ...ctx,
        emailAttempted: dto.email,
        userId: user.id,
        successful: false,
        failureReason: 'cuenta_suspendida',
      });
      throw new ForbiddenError(
        'Tu cuenta está suspendida.',
        'CUENTA_SUSPENDIDA',
        {
          reason: user.suspensionReason,
        },
      );
    }

    if (user.isDisabled()) {
      await this.attempts.record({
        ...ctx,
        emailAttempted: dto.email,
        userId: user.id,
        successful: false,
        failureReason: 'cuenta_deshabilitada',
      });
      throw new ForbiddenError(
        'Tu acceso fue deshabilitado. Comunícate con el administrador de tu restaurante.',
        'CUENTA_DESHABILITADA',
      );
    }

    // Un restaurante pendiente de aprobacion SI entra (GU-01 Esc. 2); lo que
    // queda limitado es lo que puede hacer adentro.
    await this.users.registerSuccessfulLogin(user.id);
    await this.attempts.record({
      ...ctx,
      emailAttempted: dto.email,
      userId: user.id,
      successful: true,
    });

    return this.issueSession(user, session);
  }

  /** Compartido con el caso de uso de refresh: envuelve una sesion de Supabase. */
  issueSession(user: User, session: SupabaseSession): AuthResult {
    return {
      user: toPublicUser(user),
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      refreshToken: session.refreshToken,
      refreshTokenMaxAgeMs: this.refreshCookieMaxAgeMs(),
    };
  }

  /**
   * Vida de la cookie httpOnly que guarda el refresh token en el navegador.
   * No es la vigencia real del token en Supabase (ese la controla Supabase);
   * es solo cuanto tiempo el navegador sigue enviandolo.
   */
  private refreshCookieMaxAgeMs(): number {
    return parseDuration(this.config.get<string>('JWT_REFRESH_TTL', '30d'));
  }
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    canOperate: user.canOperate(),
    phone: user.phone,
    city: user.city,
    profilePhotoUrl: user.profilePhotoUrl,
    assignedLocation: user.assignedLocation,
  };
}

/** Convierte '15m', '30d', '12h' o '900s' a milisegundos. */
function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `Duracion invalida: "${value}". Usa formatos como 15m, 12h o 30d.`,
    );
  }
  const amount = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * multipliers[unit];
}

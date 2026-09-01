import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '../../domain/entities/user.entity';
import { LOGIN_ATTEMPT_REPOSITORY } from '../../domain/repositories/login-attempt.repository';
import type { LoginAttemptRepository } from '../../domain/repositories/login-attempt.repository';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository';
import type { SessionRepository } from '../../domain/repositories/session.repository';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { PasswordService } from '../../infrastructure/security/password.service';
import { TokenService } from '../../infrastructure/security/token.service';
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
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(LOGIN_ATTEMPT_REPOSITORY)
    private readonly attempts: LoginAttemptRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  async execute(dto: LoginDto, ctx: RequestContext): Promise<AuthResult> {
    const maxAttempts = this.config.get<number>('LOGIN_MAX_ATTEMPTS', 5);
    const lockMinutes = this.config.get<number>('LOGIN_LOCK_MINUTES', 15);

    const user = await this.users.findByEmail(dto.email);

    if (!user) {
      // Se gasta el mismo tiempo que una verificacion real para no filtrar por
      // temporizacion que el correo no existe.
      await this.passwords.wasteTimeLikeARealVerification(dto.password);
      await this.attempts.record({
        ...ctx,
        emailAttempted: dto.email,
        successful: false,
        failureReason: 'correo_inexistente',
      });
      throw new UnauthorizedException(GENERIC_ERROR);
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
      throw new ForbiddenException({
        code: 'CUENTA_BLOQUEADA',
        message: `Demasiados intentos fallidos. Intenta de nuevo en ${minutesLeft} minuto(s).`,
        minutesLeft,
      });
    }

    const passwordOk = await this.passwords.verify(
      user.passwordHash,
      dto.password,
    );
    if (!passwordOk) {
      await this.users.registerFailedLogin(user.id, maxAttempts, lockMinutes);
      await this.attempts.record({
        ...ctx,
        emailAttempted: dto.email,
        userId: user.id,
        successful: false,
        failureReason: 'password_incorrecta',
      });
      throw new UnauthorizedException(GENERIC_ERROR);
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
      throw new ForbiddenException({
        code: 'CUENTA_SUSPENDIDA',
        message: 'Tu cuenta está suspendida.',
        reason: user.suspensionReason,
      });
    }

    if (user.isDisabled()) {
      await this.attempts.record({
        ...ctx,
        emailAttempted: dto.email,
        userId: user.id,
        successful: false,
        failureReason: 'cuenta_deshabilitada',
      });
      throw new ForbiddenException({
        code: 'CUENTA_DESHABILITADA',
        message:
          'Tu acceso fue deshabilitado. Comunícate con el administrador de tu restaurante.',
      });
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

    return this.issueSession(user, ctx);
  }

  /** Compartido con el caso de uso de refresh. */
  async issueSession(user: User, ctx: RequestContext): Promise<AuthResult> {
    const refresh = this.tokens.issueRefreshToken();
    await this.sessions.create({
      userId: user.id,
      refreshTokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    });

    return {
      user: toPublicUser(user),
      accessToken,
      expiresIn: this.tokens.accessTokenTtl,
      refreshToken: refresh.token,
      refreshTokenMaxAgeMs: this.tokens.refreshTokenMaxAgeMs,
    };
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

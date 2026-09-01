import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { LOGIN_ATTEMPT_REPOSITORY } from './domain/repositories/login-attempt.repository';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './domain/repositories/password-reset-token.repository';
import { PASSWORD_RESET_MAILER } from './application/ports/password-reset-mailer';
import { PASSWORD_RESET_TOKEN_SERVICE } from './application/ports/password-reset-token-service';
import { PASSWORD_HASHER } from './domain/services/password-hasher';
import { AuthController } from './infrastructure/http/auth.controller';
import { PrismaLoginAttemptRepository } from './infrastructure/persistence/prisma-login-attempt.repository';
import { PrismaSessionRepository } from './infrastructure/persistence/prisma-session.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { PrismaPasswordResetTokenRepository } from './infrastructure/persistence/prisma-password-reset-token.repository';
import { PasswordService } from './infrastructure/security/password.service';
import { PasswordResetTokenServiceImpl } from './infrastructure/security/password-reset-token.service';
import { TokenService } from './infrastructure/security/token.service';
import { BrevoMailerService } from './infrastructure/messaging/brevo-mailer.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: config.get<string>(
            'JWT_ACCESS_TTL',
            '15m',
          ) as JwtSignOptions['expiresIn'],
          issuer: config.get<string>('JWT_ISSUER', 'parchemos-api'),
          audience: config.get<string>('JWT_AUDIENCE', 'parchemos-app'),
        },
        verifyOptions: {
          issuer: config.get<string>('JWT_ISSUER', 'parchemos-api'),
          audience: config.get<string>('JWT_AUDIENCE', 'parchemos-app'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    RegisterUserUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    RequestPasswordResetUseCase,
    ResetPasswordUseCase,
    PasswordService,
    { provide: PASSWORD_HASHER, useExisting: PasswordService },
    TokenService,
    // Los casos de uso dependen de las interfaces del dominio, no de Prisma.
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    {
      provide: PASSWORD_RESET_TOKEN_REPOSITORY,
      useClass: PrismaPasswordResetTokenRepository,
    },
    { provide: PASSWORD_RESET_TOKEN_SERVICE, useClass: PasswordResetTokenServiceImpl },
    { provide: PASSWORD_RESET_MAILER, useClass: BrevoMailerService },
    {
      provide: LOGIN_ATTEMPT_REPOSITORY,
      useClass: PrismaLoginAttemptRepository,
    },
  ],
  exports: [JwtModule, PASSWORD_HASHER],
})
export class AuthModule {}

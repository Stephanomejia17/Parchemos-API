import { Module } from '@nestjs/common';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { RequestAccountDeletionUseCase } from './application/use-cases/request-account-deletion.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { LOGIN_ATTEMPT_REPOSITORY } from './domain/repositories/login-attempt.repository';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { AuthController } from './infrastructure/http/auth.controller';
import { SupabaseJwtGuard } from './infrastructure/guards/supabase-jwt.guard';
import { PrismaLoginAttemptRepository } from './infrastructure/persistence/prisma-login-attempt.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { UploadProfileImageUseCase } from './application/use-cases/upload-profile-image.use-case';

@Module({
  controllers: [AuthController],
  providers: [
    RegisterUserUseCase,
    RequestAccountDeletionUseCase,
    UpdateProfileUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    RequestPasswordResetUseCase,
    ResetPasswordUseCase,
    UploadProfileImageUseCase,
    SupabaseJwtGuard,
    // Los casos de uso dependen de las interfaces del dominio, no de Prisma.
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    {
      provide: LOGIN_ATTEMPT_REPOSITORY,
      useClass: PrismaLoginAttemptRepository,
    },
  ],
  exports: [SupabaseJwtGuard],
})
export class AuthModule {}

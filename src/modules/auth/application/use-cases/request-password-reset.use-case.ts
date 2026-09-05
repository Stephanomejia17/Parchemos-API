import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthService } from '../../../../infrastructure/auth/supabase-auth.service';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';

/**
 * GU-03 - Solicitud de recuperacion de password.
 *
 * El correo lo envia el propio Supabase (resetPasswordForEmail); aqui solo se
 * filtran las cuentas que no deben poder recuperar password (deshabilitadas o
 * inexistentes), sin revelar cual de las dos paso.
 */
@Injectable()
export class RequestPasswordResetUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly config: ConfigService,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || user.isDisabled()) return;

    const frontendUrl = this.config.getOrThrow<string>('PASSWORD_RESET_URL');
    await this.supabaseAuth.sendPasswordResetEmail(user.email, frontendUrl);
  }
}

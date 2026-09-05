import { Injectable } from '@nestjs/common';
import { UnauthorizedError } from '../../../../common/errors/unauthorized-error';
import { SupabaseAuthService } from '../../../../infrastructure/auth/supabase-auth.service';
import { InvalidTokenError } from '../../domain/errors/invalid-token.error';

/**
 * GU-03 - Aplica el nuevo password.
 *
 * El "token" es el access token de recuperacion que Supabase entrega al
 * frontend tras el enlace del correo: probarlo demuestra que el dueno de la
 * cuenta abrio el enlace, igual que antes lo demostraba el token propio.
 */
@Injectable()
export class ResetPasswordUseCase {
  constructor(private readonly supabaseAuth: SupabaseAuthService) {}

  async execute(recoveryToken: string, newPassword: string): Promise<void> {
    try {
      const user = await this.supabaseAuth.verifyAccessToken(recoveryToken);
      await this.supabaseAuth.updateUserPassword(user.id, newPassword);
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw new UnauthorizedError(
          'El enlace de recuperación no es válido o expiró.',
          'INVALID_RESET_TOKEN',
        );
      }
      throw error;
    }
  }
}

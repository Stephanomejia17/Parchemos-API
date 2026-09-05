import { Injectable } from '@nestjs/common';
import { SupabaseAuthService } from '../../../../infrastructure/auth/supabase-auth.service';

/** GU-02 Esc. 5 y 6 - Cierre de sesion. */
@Injectable()
export class LogoutUseCase {
  constructor(private readonly supabaseAuth: SupabaseAuthService) {}

  /**
   * Revoca la sesion en Supabase a partir del refresh token de la cookie. Es
   * idempotente a proposito: un logout con un token ya invalido no debe
   * devolver error ni revelar nada.
   */
  async execute(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const session = await this.supabaseAuth.refreshSession(refreshToken);
    if (!session) return;
    await this.supabaseAuth.signOut(session.accessToken).catch(() => undefined);
  }
}

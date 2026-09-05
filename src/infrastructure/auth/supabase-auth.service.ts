import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { InvalidTokenError } from '../../modules/auth/domain/errors/invalid-token.error';
import { SupabaseUserAlreadyExistsError } from '../../modules/auth/domain/errors/supabase-user-already-exists.error';

export interface SupabaseAuthUser {
  id: string;
  email: string;
  emailConfirmedAt: Date | null;
}

export interface CreateSupabaseUserData {
  email: string;
  password: string;
}

/** Sesion tal como la emite Supabase: es lo que viaja al cliente. */
export interface SupabaseSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Adaptador a Supabase Auth: unico proveedor de identidad de la plataforma.
 *
 * Usa dos clientes: uno con la service-role key (nunca sale del backend) para
 * verificar tokens y aprovisionar/administrar cuentas via Admin API, y otro
 * con la anon key para las operaciones de sesion (login, refresh, password
 * recovery) que Supabase espera del lado publico.
 */
@Injectable()
export class SupabaseAuthService {
  private readonly adminClient: ReturnType<typeof createClient>;
  private readonly anonClient: ReturnType<typeof createClient>;

  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>('SUPABASE_URL');
    const serviceRoleKey = config.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    const anonKey = config.getOrThrow<string>('SUPABASE_ANON_KEY');
    const clientOptions = {
      auth: { autoRefreshToken: false, persistSession: false },
    };
    this.adminClient = createClient(url, serviceRoleKey, clientOptions);
    this.anonClient = createClient(url, anonKey, clientOptions);
  }

  async verifyAccessToken(accessToken: string): Promise<SupabaseAuthUser> {
    const { data, error } = await this.adminClient.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new InvalidTokenError(error?.message);
    }
    return toSupabaseAuthUser(data.user);
  }

  /** GU-01: registro propio y alta de personal (GU-05) nacen aqui. */
  async createUser(data: CreateSupabaseUserData): Promise<SupabaseAuthUser> {
    const { data: created, error } =
      await this.adminClient.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
      });
    if (error || !created.user) {
      if (isEmailAlreadyRegistered(error)) {
        throw new SupabaseUserAlreadyExistsError(data.email);
      }
      throw new Error(
        error?.message ?? 'No se pudo crear el usuario en Supabase Auth.',
      );
    }
    return toSupabaseAuthUser(created.user);
  }

  /**
   * Revierte una cuenta creada en createUser cuando el resto del alta falla
   * despues. Best-effort: si Supabase ya no la tiene, no hay nada que revertir.
   */
  async deleteUser(id: string): Promise<void> {
    await this.adminClient.auth.admin.deleteUser(id);
  }

  /** GU-02 Esc. 1 a 4 - Inicio de sesion. Null si el password es incorrecto. */
  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<SupabaseSession | null> {
    const { data, error } = await this.anonClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) return null;
    return toSupabaseSession(data.session);
  }

  /** Rotacion de sesion via refresh token. Null si ya no es valido. */
  async refreshSession(refreshToken: string): Promise<SupabaseSession | null> {
    const { data, error } = await this.anonClient.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session) return null;
    return toSupabaseSession(data.session);
  }

  /** GU-02 Esc. 5 - Revoca la sesion asociada a ese access token. */
  async signOut(accessToken: string): Promise<void> {
    await this.adminClient.auth.admin.signOut(accessToken, 'local');
  }

  /** GU-03 - Dispara el correo de recuperacion que envia el propio Supabase. */
  async sendPasswordResetEmail(
    email: string,
    redirectTo: string,
  ): Promise<void> {
    await this.anonClient.auth.resetPasswordForEmail(email, { redirectTo });
  }

  /** GU-03 - Aplica el nuevo password tras validar el token de recuperacion. */
  async updateUserPassword(userId: string, password: string): Promise<void> {
    const { error } = await this.adminClient.auth.admin.updateUserById(userId, {
      password,
    });
    if (error) {
      throw new Error(error.message);
    }
  }
}

function toSupabaseAuthUser(user: {
  id: string;
  email?: string;
  email_confirmed_at?: string;
}): SupabaseAuthUser {
  return {
    id: user.id,
    email: user.email ?? '',
    emailConfirmedAt: user.email_confirmed_at
      ? new Date(user.email_confirmed_at)
      : null,
  };
}

function toSupabaseSession(session: {
  user: { id: string };
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): SupabaseSession {
  return {
    userId: session.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
  };
}

function isEmailAlreadyRegistered(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === 'email_exists') return true;
  return /already.*registe/i.test(error.message ?? '');
}

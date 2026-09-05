import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConflictError } from '../../../../common/errors/conflict-error';
import { SupabaseAuthService } from '../../../../infrastructure/auth/supabase-auth.service';
import { User } from '../../domain/entities/user.entity';
import { SupabaseUserAlreadyExistsError } from '../../domain/errors/supabase-user-already-exists.error';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { RegisterDto } from '../dto/register.dto';

/**
 * GU-01 - Registro en la plataforma (PARCHE-169).
 *
 * La cuenta nace en Supabase Auth: el id que asigna Supabase pasa a ser el id
 * de public.users, y el password ya no se guarda localmente.
 */
@Injectable()
export class RegisterUserUseCase {
  private readonly logger = new Logger(RegisterUserUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly config: ConfigService,
  ) {}

  async execute(dto: RegisterDto): Promise<User> {
    // GU-01 Esc. 3: un correo no puede repetirse en ningun rol.
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError(
        'Ese correo ya está en uso.',
        'EMAIL_ALREADY_IN_USE',
      );
    }

    const supabaseUser = await this.createSupabaseIdentity(dto);

    try {
      const user = await this.users.create({
        id: supabaseUser.id,
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone,
        city: dto.city,
        profilePhotoUrl: dto.profilePhotoUrl ?? null,
        role: dto.role,
        termsVersion: this.config.get<string>('TERMS_VERSION', '1.0'),
        acceptedAt: new Date(),
      });
      this.logger.log(`Cuenta creada: rol=${user.role} estado=${user.status}`);
      return user;
    } catch (error) {
      // La cuenta de Supabase ya se creo pero el perfil local fallo: se
      // revierte para no dejar una identidad huerfana sin datos en la app.
      await this.supabaseAuth
        .deleteUser(supabaseUser.id)
        .catch(() => undefined);
      // Carrera entre dos registros simultaneos con el mismo correo: el indice
      // unico de la base de datos es la ultima linea de defensa.
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'Ese correo ya está en uso.',
          'EMAIL_ALREADY_IN_USE',
        );
      }
      throw error;
    }
  }

  private async createSupabaseIdentity(dto: RegisterDto) {
    try {
      return await this.supabaseAuth.createUser({
        email: dto.email,
        password: dto.password,
      });
    } catch (error) {
      if (error instanceof SupabaseUserAlreadyExistsError) {
        throw new ConflictError(
          'Ese correo ya está en uso.',
          'EMAIL_ALREADY_IN_USE',
        );
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'P2002' || code === '23505';
}

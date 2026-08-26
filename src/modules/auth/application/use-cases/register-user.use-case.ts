import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '../../domain/entities/user.entity';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { PasswordService } from '../../infrastructure/security/password.service';
import { RegisterDto } from '../dto/register.dto';

/** GU-01 - Registro en la plataforma (PARCHE-169). */
@Injectable()
export class RegisterUserUseCase {
  private readonly logger = new Logger(RegisterUserUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService,
  ) {}

  async execute(dto: RegisterDto): Promise<User> {
    // GU-01 Esc. 3: un correo no puede repetirse en ningun rol.
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Ese correo ya está en uso.');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    try {
      const user = await this.users.create({
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
        role: dto.role,
        termsVersion: this.config.get<string>('TERMS_VERSION', '1.0'),
        acceptedAt: new Date(),
      });
      this.logger.log(`Cuenta creada: rol=${user.role} estado=${user.status}`);
      return user;
    } catch (error) {
      // Carrera entre dos registros simultaneos con el mismo correo: el indice
      // unico de la base de datos es la ultima linea de defensa.
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ese correo ya está en uso.');
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'P2002' || code === '23505';
}

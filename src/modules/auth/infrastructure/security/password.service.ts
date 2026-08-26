import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from '@node-rs/argon2';

/** Argon2id. El paquete lo expone como const enum ambiental, que no compila
 *  con isolatedModules, asi que se fija el valor directamente. */
const ARGON2ID = 2;

/**
 * Hash de contrasenas con Argon2id (ganador del Password Hashing Competition
 * y recomendacion actual de OWASP).
 */
@Injectable()
export class PasswordService {
  private readonly options: {
    algorithm: number;
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };

  /**
   * Hash de una contrasena ficticia. Se usa cuando el correo no existe para
   * que un atacante no pueda distinguir "correo no registrado" de "clave mala"
   * midiendo el tiempo de respuesta (GU-02 Esc. 2).
   */
  private readonly dummyHash: Promise<string>;

  constructor(config: ConfigService) {
    this.options = {
      algorithm: ARGON2ID,
      memoryCost: config.get<number>('PASSWORD_HASH_MEMORY_KIB', 65536),
      timeCost: config.get<number>('PASSWORD_HASH_ITERATIONS', 3),
      parallelism: config.get<number>('PASSWORD_HASH_PARALLELISM', 4),
    };
    this.dummyHash = hash(
      'contrasena-inexistente-para-igualar-tiempos',
      this.options,
    );
  }

  hash(plainPassword: string): Promise<string> {
    return hash(plainPassword, this.options);
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plainPassword, this.options);
    } catch {
      return false;
    }
  }

  /** Consume el mismo tiempo que una verificacion real y siempre falla. */
  async wasteTimeLikeARealVerification(plainPassword: string): Promise<void> {
    await this.verify(await this.dummyHash, plainPassword);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  LoginAttemptData,
  LoginAttemptRepository,
} from '../../domain/repositories/login-attempt.repository';

@Injectable()
export class PrismaLoginAttemptRepository implements LoginAttemptRepository {
  private readonly logger = new Logger(PrismaLoginAttemptRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(data: LoginAttemptData): Promise<void> {
    try {
      await this.prisma.loginAttempt.create({
        data: {
          emailAttempted: data.emailAttempted,
          userId: data.userId ?? undefined,
          successful: data.successful,
          failureReason: data.successful
            ? undefined
            : (data.failureReason ?? undefined),
          ipAddress: data.ipAddress ?? undefined,
          userAgent: data.userAgent?.slice(0, 500) ?? undefined,
        },
      });
    } catch (error) {
      // La bitacora nunca debe tumbar un login valido.
      this.logger.warn(
        `No se pudo registrar el intento de login: ${String(error)}`,
      );
    }
  }
}

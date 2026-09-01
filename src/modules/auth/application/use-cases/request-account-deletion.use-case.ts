import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';

const DELETION_GRACE_PERIOD_DAYS = 30;

@Injectable()
export class RequestAccountDeletionUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(userId: string): Promise<{
    message: string;
    deletionEffectiveAt: Date;
  }> {
    const existingUser = await this.users.findById(userId);
    if (!existingUser) {
      throw new NotFoundException('No se encontró el usuario autenticado.');
    }

    if (existingUser.isDeletionPending() || existingUser.deletionRequestedAt) {
      throw new ConflictException({
        code: 'ELIMINACION_YA_SOLICITADA',
        message: 'La cuenta ya tiene una solicitud de eliminación pendiente.',
        deletionEffectiveAt: existingUser.deletionEffectiveAt,
      });
    }

    const deletionRequestedAt = new Date();
    const deletionEffectiveAt = new Date(deletionRequestedAt);
    deletionEffectiveAt.setDate(
      deletionEffectiveAt.getDate() + DELETION_GRACE_PERIOD_DAYS,
    );

    const updatedUser = await this.users.requestAccountDeletion(
      userId,
      deletionRequestedAt,
      deletionEffectiveAt,
    );
    if (!updatedUser) {
      throw new NotFoundException(
        'No se pudo solicitar la eliminación de la cuenta.',
      );
    }

    return {
      message: 'La cuenta quedó pendiente de eliminación.',
      deletionEffectiveAt:
        updatedUser.deletionEffectiveAt ?? deletionEffectiveAt,
    };
  }
}
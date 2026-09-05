import { Inject, Injectable } from '@nestjs/common';
import { ConflictError } from '../../../../common/errors/conflict-error';
import { NotFoundError } from '../../../../common/errors/not-found-error';
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
      throw new NotFoundError(
        'No se encontró el usuario autenticado.',
        'USER_NOT_FOUND',
      );
    }

    if (existingUser.isDeletionPending() || existingUser.deletionRequestedAt) {
      throw new ConflictError(
        'La cuenta ya tiene una solicitud de eliminación pendiente.',
        'ELIMINACION_YA_SOLICITADA',
        { deletionEffectiveAt: existingUser.deletionEffectiveAt },
      );
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
      const currentUser = await this.users.findById(userId);
      if (currentUser?.isDeletionPending() || currentUser?.deletionRequestedAt) {
        throw new ConflictError(
          'La cuenta ya tiene una solicitud de eliminación pendiente.',
          'ELIMINACION_YA_SOLICITADA',
          { deletionEffectiveAt: currentUser.deletionEffectiveAt },
        );
      }
      throw new NotFoundError(
        'No se pudo solicitar la eliminación de la cuenta.',
        'USER_NOT_FOUND',
      );
    }

    return {
      message: 'La cuenta quedó pendiente de eliminación.',
      deletionEffectiveAt:
        updatedUser.deletionEffectiveAt ?? deletionEffectiveAt,
    };
  }
}
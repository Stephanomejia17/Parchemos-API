import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { PublicUser } from '../dto/auth-response.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { toPublicUser } from './login.use-case';

@Injectable()
export class UpdateProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    const existingUser = await this.users.findById(userId);
    if (!existingUser) {
      throw new NotFoundError(
        'No se encontró el usuario autenticado.',
        'USER_NOT_FOUND',
      );
    }

    const updatedUser = await this.users.updateProfile(userId, {
      fullName: dto.fullName,
      phone: dto.phone,
      city: dto.city,
      profilePhotoUrl: dto.profilePhotoUrl,
    });

    if (!updatedUser) {
      throw new NotFoundError(
        'No se pudo actualizar el perfil del usuario.',
        'USER_NOT_FOUND',
      );
    }

    return toPublicUser(updatedUser);
  }
}

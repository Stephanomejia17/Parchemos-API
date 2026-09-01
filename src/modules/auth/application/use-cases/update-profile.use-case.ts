import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
      throw new NotFoundException('No se encontró el usuario autenticado.');
    }

    const updatedUser = await this.users.updateProfile(userId, {
      fullName: dto.fullName,
      phone: dto.phone,
      city: dto.city,
      profilePhotoUrl: dto.profilePhotoUrl,
    });

    if (!updatedUser) {
      throw new NotFoundException('No se pudo actualizar el perfil del usuario.');
    }

    return toPublicUser(updatedUser);
  }
}

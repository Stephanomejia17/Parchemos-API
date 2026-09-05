import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { SupabaseStorageService } from '../../../../infrastructure/storage/supabase-storage.service';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { toPublicUser } from './login.use-case';

interface ProfileImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class UploadProfileImageUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly storage: SupabaseStorageService,
  ) {}

  async execute(userId: string, file: ProfileImageFile) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('La cuenta no existe.', 'USER_NOT_FOUND');

    const uploaded = await this.storage.uploadImage(file, `profiles/${userId}`);
    let updated;
    try {
      updated = await this.users.updateProfile(userId, {
        profilePhotoUrl: uploaded.publicUrl,
      });
      if (!updated) throw new NotFoundError('La cuenta no existe.', 'USER_NOT_FOUND');
    } catch (error) {
      await this.storage.remove(uploaded.path);
      throw error;
    }

    const previousPath = user.profilePhotoUrl
      ? this.storage.pathFromPublicUrl(user.profilePhotoUrl)
      : null;
    if (previousPath) await this.storage.remove(previousPath);
    return toPublicUser(updated);
  }
}

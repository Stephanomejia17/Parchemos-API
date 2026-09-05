import { Injectable } from '@nestjs/common';
import { SupabaseStorageService } from '../../../../infrastructure/storage/supabase-storage.service';
import {
  ImageFile,
  ImageStorage,
  UploadedImage,
} from '../../domain/services/image-storage';

/** Adaptador del puerto ImageStorage sobre el SupabaseStorageService compartido. */
@Injectable()
export class SupabaseImageStorage implements ImageStorage {
  constructor(private readonly storage: SupabaseStorageService) {}

  async uploadImage(file: ImageFile, folder: string): Promise<UploadedImage> {
    const uploaded = await this.storage.uploadImage(file, folder);
    return { path: uploaded.path, publicUrl: uploaded.publicUrl };
  }

  remove(path: string): Promise<void> {
    return this.storage.remove(path);
  }

  pathFromPublicUrl(url: string): string | null {
    return this.storage.pathFromPublicUrl(url);
  }
}

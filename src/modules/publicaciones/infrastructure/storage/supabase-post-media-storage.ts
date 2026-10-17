import { Injectable } from '@nestjs/common';
import { SupabaseStorageService } from '../../../../infrastructure/storage/supabase-storage.service';
import type { PostMediaStorage } from '../../domain/post-media-storage';

/** Adaptador del puerto PostMediaStorage sobre el SupabaseStorageService compartido. */
@Injectable()
export class SupabasePostMediaStorage implements PostMediaStorage {
  constructor(private readonly storage: SupabaseStorageService) {}

  async upload(
    file: Buffer,
    options: { folder: string; contentType: string; extension: string },
  ): Promise<string> {
    const uploaded = await this.storage.uploadObject(file, options);
    return uploaded.path;
  }

  async removeMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.storage.removePostMedia(key)));
  }

  urlFor(key: string): string {
    return this.storage.publicUrl(key);
  }
}

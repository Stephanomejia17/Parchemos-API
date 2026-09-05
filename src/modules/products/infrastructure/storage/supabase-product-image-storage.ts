import { Injectable } from '@nestjs/common';
import { SupabaseStorageService } from '../../../../infrastructure/storage/supabase-storage.service';
import { ProductImageFile, ProductImageStorage } from '../../domain/services/product-image-storage';

@Injectable()
export class SupabaseProductImageStorage implements ProductImageStorage {
  constructor(private readonly storage: SupabaseStorageService) {}
  async uploadImage(file: ProductImageFile, folder: string) {
    const uploaded = await this.storage.uploadImage(file, folder);
    return { path: uploaded.path, publicUrl: uploaded.publicUrl };
  }
  remove(path: string): Promise<void> { return this.storage.remove(path); }
  pathFromPublicUrl(url: string): string | null { return this.storage.pathFromPublicUrl(url); }
}

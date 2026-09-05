export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');

export interface UploadedImage {
  path: string;
  publicUrl: string;
}

export interface ImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Puerto de almacenamiento de imagenes: application no conoce Supabase
 * Storage, solo este contrato. La regla 2 prohibe inyectar
 * SupabaseStorageService directamente en un caso de uso.
 */
export interface ImageStorage {
  uploadImage(file: ImageFile, folder: string): Promise<UploadedImage>;
  remove(path: string): Promise<void>;
  pathFromPublicUrl(url: string): string | null;
}

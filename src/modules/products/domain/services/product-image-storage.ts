export const PRODUCT_IMAGE_STORAGE = Symbol('PRODUCT_IMAGE_STORAGE');

export interface ProductImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface ProductImageStorage {
  uploadImage(file: ProductImageFile, folder: string): Promise<{ path: string; publicUrl: string }>;
  remove(path: string): Promise<void>;
  pathFromPublicUrl(url: string): string | null;
}

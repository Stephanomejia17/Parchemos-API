export const POST_MEDIA_STORAGE = Symbol('POST_MEDIA_STORAGE');

export interface PostMediaStorage {
  /** Sube el binario y devuelve la clave del objeto (`storage_key`). */
  upload(
    file: Buffer,
    options: { folder: string; contentType: string; extension: string },
  ): Promise<string>;
  /** Borra objetos; nunca lanza (se usa para compensar fallos). */
  removeMany(keys: string[]): Promise<void>;
  /** URL publica (CDN) de un objeto. */
  urlFor(key: string): string;
}

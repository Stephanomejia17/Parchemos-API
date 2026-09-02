import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

export interface UploadedImage {
  path: string;
  publicUrl: string;
  contentType: string;
  size: number;
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Adaptador compartido para Supabase Storage. La service-role key nunca sale del backend. */
@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly supabaseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    this.serviceRoleKey = config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.bucket = config.getOrThrow<string>('SUPABASE_STORAGE_BUCKET');
  }

  async uploadImage(
    file: { buffer: Buffer; mimetype: string; size: number },
    folder: string,
  ): Promise<UploadedImage> {
    this.validateImage(file);
    const extension = extensionFor(file.mimetype);
    const path = `${cleanFolder(folder)}/${randomUUID()}.${extension}`;
    const response = await fetch(this.objectUrl(path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        apikey: this.serviceRoleKey,
        'Content-Type': file.mimetype,
        'x-upsert': 'false',
      },
      body: file.buffer as unknown as BodyInit,
    });

    if (!response.ok) {
      const details = await response.text();
      this.logger.error(`Supabase Storage rechazó la imagen: ${response.status} ${details}`);
      throw new InternalServerErrorException('No se pudo subir la imagen.');
    }

    return {
      path,
      publicUrl: `${this.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(this.bucket)}/${path}`,
      contentType: file.mimetype,
      size: file.size,
    };
  }

  async remove(path: string): Promise<void> {
    const response = await fetch(this.objectUrl(path), {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        apikey: this.serviceRoleKey,
      },
    });
    if (!response.ok && response.status !== 404) {
      const details = await response.text();
      this.logger.warn(`No se pudo eliminar ${path} de Storage: ${response.status} ${details}`);
    }
  }

  pathFromPublicUrl(url: string): string | null {
    const prefix = `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }

  private objectUrl(path: string): string {
    return `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${path}`;
  }

  private validateImage(file: { mimetype: string; size: number }): void {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Solo se permiten imágenes JPG, PNG o WEBP.');
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new BadRequestException('La imagen no puede superar 5 MB.');
    }
  }
}

function cleanFolder(folder: string): string {
  const cleaned = folder.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '');
  if (!cleaned) throw new BadRequestException('La carpeta de almacenamiento no es válida.');
  return cleaned;
}

function extensionFor(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

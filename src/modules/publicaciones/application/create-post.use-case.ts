import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Role } from '../../../common/enums/role.enum';
import { ForbiddenError } from '../../../common/errors/forbidden-error';
import { NotFoundError } from '../../../common/errors/not-found-error';
import { ValidationError } from '../../../common/errors/validation-error';
import {
  ALLOWED_FORMATS_LABEL,
  MAX_POST_MEDIA_BYTES,
  MAX_POST_MEDIA_FILES,
  inspectMedia,
  type InspectedMedia,
} from '../domain/media-inspector';
import { POST_MEDIA_STORAGE } from '../domain/post-media-storage';
import type { PostMediaStorage } from '../domain/post-media-storage';
import { POST_REPOSITORY } from '../domain/post.repository';
import type { NewPostMedia, PostRepository } from '../domain/post.repository';
import { presentPost } from './post.presenter';

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export interface CreatePostCommand {
  authorId: string;
  /** Rol de quien publica: define si la sede es obligatoria. */
  authorRole: Role;
  files: UploadedFile[];
  caption?: string;
  locationId?: string | null;
}

/**
 * DO-04: publica fotos/videos. Orden pensado para no dejar basura (CA8):
 * 1) validar todo antes de tocar el almacenamiento, 2) subir los binarios,
 * 3) guardar post + medios en una transaccion y 4) si algo falla despues de
 * subir, borrar los objetos ya subidos.
 */
@Injectable()
export class CreatePostUseCase {
  private readonly logger = new Logger(CreatePostUseCase.name);

  constructor(
    @Inject(POST_REPOSITORY) private readonly posts: PostRepository,
    @Inject(POST_MEDIA_STORAGE) private readonly storage: PostMediaStorage,
  ) {}

  async execute(command: CreatePostCommand) {
    // RN2: una publicacion requiere al menos un archivo.
    if (!command.files.length) {
      throw new BadRequestException(
        'Debes adjuntar al menos una foto o un video.',
      );
    }
    if (command.files.length > MAX_POST_MEDIA_FILES) {
      throw new BadRequestException(
        `Puedes adjuntar hasta ${MAX_POST_MEDIA_FILES} archivos por publicación.`,
      );
    }

    const inspected = command.files.map((file) => this.inspect(file));

    const locationId = await this.resolveLocation(command);

    const uploadedKeys: string[] = [];
    try {
      const media: NewPostMedia[] = [];
      for (const [position, { file, info }] of inspected.entries()) {
        const storageKey = await this.storage.upload(file.buffer, {
          folder: `posts/${command.authorId}`,
          contentType: info.mimeType,
          extension: info.extension,
        });
        uploadedKeys.push(storageKey);
        media.push({
          mediaType: info.mediaType,
          storageKey,
          mimeType: info.mimeType,
          sizeBytes: file.size,
          width: info.width,
          height: info.height,
          durationSeconds: info.durationSeconds,
          position,
        });
      }

      const post = await this.posts.create({
        authorId: command.authorId,
        locationId,
        caption: command.caption?.trim() || null,
        media,
      });
      return presentPost(post, this.storage);
    } catch (error) {
      this.logger.warn(
        `Publicación fallida; se limpian ${uploadedKeys.length} objeto(s).`,
      );
      await this.storage.removeMany(uploadedKeys);
      throw error;
    }
  }

  /**
   * Sede (y por ende marca) a la que queda ligada la publicacion.
   * - Restaurante: la sede es obligatoria y debe ser de uno de sus restaurantes;
   *   un dueño con varias sedes elige a cual pertenece el contenido.
   * - Comensal: es opcional (DO-04 CA3), pero si la elige se asocia igual a su
   *   sede y a la marca de esa sede.
   */
  private async resolveLocation(
    command: CreatePostCommand,
  ): Promise<string | null> {
    const locationId = command.locationId ?? null;
    const isOwner = command.authorRole === Role.RESTAURANTE;

    if (!locationId) {
      if (isOwner) {
        throw new ValidationError(
          'Elige la sede a la que pertenece esta publicación.',
          'LOCATION_REQUIRED',
        );
      }
      return null;
    }

    const use = await this.posts.checkLocation(
      locationId,
      isOwner ? command.authorId : undefined,
    );
    if (use === 'not_found') {
      throw new NotFoundError(
        'El restaurante seleccionado no existe o no está disponible.',
      );
    }
    if (use === 'not_owned') {
      throw new ForbiddenError(
        'Solo puedes publicar en las sedes de tus restaurantes.',
        'LOCATION_NOT_OWNED',
      );
    }
    return locationId;
  }

  private inspect(file: UploadedFile): {
    file: UploadedFile;
    info: InspectedMedia;
  } {
    if (file.size > MAX_POST_MEDIA_BYTES) {
      throw new PayloadTooLargeException(
        `"${file.originalname}" supera el límite de ${MAX_POST_MEDIA_BYTES / 1024 / 1024} MB por archivo.`,
      );
    }
    const info = inspectMedia(file.buffer);
    if (!info) {
      throw new UnsupportedMediaTypeException(
        `"${file.originalname}" no es un formato soportado. Formatos permitidos: ${ALLOWED_FORMATS_LABEL}.`,
      );
    }
    if (info.mediaType === 'video' && info.durationSeconds === null) {
      throw new BadRequestException(
        `No pudimos leer la duración de "${file.originalname}".`,
      );
    }
    return { file, info };
  }
}

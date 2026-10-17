import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  MAX_POST_MEDIA_BYTES,
  MAX_POST_MEDIA_FILES,
} from '../../domain/media-inspector';

/**
 * Multer acota el consumo de memoria antes de que el archivo llegue al caso
 * de uso: superar el limite responde 413 sin cargar el resto. El tipo real se
 * valida despues por contenido (`inspectMedia`), no por el `Content-Type`.
 */
export const postMediaUploadOptions: MulterOptions = {
  limits: { fileSize: MAX_POST_MEDIA_BYTES, files: MAX_POST_MEDIA_FILES },
};

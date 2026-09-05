import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { BadRequestException } from '@nestjs/common';

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Configuracion comun para limitar el consumo de memoria al recibir imagenes. */
export const imageUploadOptions: MulterOptions = {
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (_request, file, callback) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      callback(new BadRequestException('Solo se permiten imagenes JPG, PNG o WEBP.'), false);
      return;
    }
    callback(null, true);
  },
};

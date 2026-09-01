import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Actualizacion del perfil personal de PU-01.
 * Reutiliza las validaciones del stack actual (class-validator).
 */
export class UpdateProfileDto {
  @IsString({ message: 'El nombre completo es obligatorio.' })
  @MinLength(2, { message: 'El nombre completo debe tener al menos 2 caracteres.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  fullName!: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser un texto válido.' })
  @Matches(
    /^(?:\+57\s?)?(?:3\d{2}|\d{2})\s?\d{3}\s?\d{2}\s?\d{2}$/,
    {
      message:
        'El teléfono debe tener formato válido. Ejemplo: +57 300 123 4567 o 3001234567.',
    },
  )
  @MaxLength(30, { message: 'El teléfono no puede superar 30 caracteres.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  phone?: string;

  @IsString({ message: 'La ciudad es obligatoria.' })
  @MinLength(2, { message: 'La ciudad debe tener al menos 2 caracteres.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  city!: string;

  @IsOptional()
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'La foto de perfil debe ser una URL HTTPS válida.' },
  )
  @MaxLength(2048, { message: 'La URL de la foto no puede superar 2048 caracteres.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  profilePhotoUrl?: string;
}

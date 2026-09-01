import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Actualizacion del perfil personal de PU-01.
 * Reutiliza las validaciones del stack actual (class-validator).
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'El nombre completo debe ser texto.' })
  @MinLength(2, { message: 'El nombre completo debe tener al menos 2 caracteres.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  fullName?: string;

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
  phone?: string | null;

  @IsOptional()
  @IsString({ message: 'La ciudad debe ser texto.' })
  @MinLength(2, { message: 'La ciudad debe tener al menos 2 caracteres.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  city?: string | null;

  @IsOptional()
  @IsString()
  @IsProfilePhoto()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  profilePhotoUrl?: string | null;
}

function IsProfilePhoto(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isProfilePhoto',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === null) return true;
          if (typeof value !== 'string') return false;
          const match = /^data:image\/(jpeg|png);base64,(.+)$/.exec(value);
          return !!match && Buffer.from(match[2], 'base64').byteLength <= 5 * 1024 * 1024;
        },
        defaultMessage(_args: ValidationArguments) {
          return 'La foto debe ser JPG o PNG y no superar 5 MB.';
        },
      },
    });
  };
}

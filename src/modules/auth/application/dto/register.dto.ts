import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { Role } from '../../../../common/enums/role.enum';

/** Roles que un visitante puede elegir al registrarse (GU-01 Esc. 5). */
export const SELF_SERVICE_ROLES = [Role.COMENSAL, Role.RESTAURANTE] as const;

export class RegisterDto {
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  // GU-01 Esc. 4: minimo 8 caracteres, 1 mayuscula y 1 numero.
  @IsString()
  @Length(8, 128, {
    message: 'La contraseña debe tener entre 8 y 128 caracteres.',
  })
  @Matches(/[A-Z]/, {
    message: 'La contraseña debe incluir al menos una letra mayúscula.',
  })
  @Matches(/\d/, { message: 'La contraseña debe incluir al menos un número.' })
  password!: string;

  @IsString()
  @Length(2, 120, { message: 'Ingresa tu nombre completo.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  fullName!: string;

  @IsString()
  @Matches(
    /^(?:\+57\s?)?(?:3\d{2}|\d{2})\s?\d{3}\s?\d{2}\s?\d{2}$/,
    { message: 'El teléfono debe tener un formato válido.' },
  )
  @MaxLength(30)
  phone!: string;

  @IsString()
  @Length(2, 120, { message: 'Ingresa una ciudad válida.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  city!: string;

  // La foto de perfil no se pide al registrarse (GU-01): se sube despues
  // desde "Mi perfil". Se sigue aceptando por si un cliente antiguo la manda.
  @IsOptional()
  @IsString()
  @IsProfilePhoto()
  profilePhotoUrl?: string;

  // GU-01 Esc. 5: el rol es obligatorio y solo puede ser comensal o restaurante.
  @IsIn(SELF_SERVICE_ROLES, {
    message: 'Selecciona un rol válido: comensal o restaurante.',
  })
  role!: (typeof SELF_SERVICE_ROLES)[number];

  // GU-01 Esc. 6: sin aceptacion explicita no se crea la cuenta.
  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar los términos y condiciones.' })
  acceptedTerms!: boolean;

  @IsBoolean()
  @Equals(true, {
    message: 'Debes aceptar la política de tratamiento de datos.',
  })
  acceptedPrivacy!: boolean;
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
          if (typeof value !== 'string') return false;
          const match = /^data:image\/(jpeg|png);base64,(.+)$/.exec(value);
          if (!match) return false;
          try {
            return Buffer.from(match[2], 'base64').byteLength <= 5 * 1024 * 1024;
          } catch {
            return false;
          }
        },
        defaultMessage(_args: ValidationArguments) {
          return 'La foto debe ser JPG o PNG y no superar 5 MB.';
        },
      },
    });
  };
}

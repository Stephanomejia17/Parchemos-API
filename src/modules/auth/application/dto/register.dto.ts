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

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

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

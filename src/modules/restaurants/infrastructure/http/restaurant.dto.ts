import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  @Length(2, 160, {
    message: 'La razón social debe tener entre 2 y 160 caracteres.',
  })
  businessName!: string;
}

export class CreateLocationDto {
  @IsString()
  @Length(2, 120, { message: 'El nombre debe tener entre 2 y 120 caracteres.' })
  name!: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, value) => value !== undefined)
  @Length(20, 2000, {
    message: 'La descripción debe tener entre 20 y 2000 caracteres.',
  })
  description?: string;

  @IsString()
  @Length(5, 250, {
    message: 'La dirección debe tener entre 5 y 250 caracteres.',
  })
  address!: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @Length(2, 120, { message: 'El nombre debe tener entre 2 y 120 caracteres.' })
  name?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, value) => value !== undefined)
  @Length(20, 2000, {
    message: 'La descripción debe tener entre 20 y 2000 caracteres.',
  })
  description?: string;

  @IsOptional()
  @IsString()
  @Length(5, 250, {
    message: 'La dirección debe tener entre 5 y 250 caracteres.',
  })
  address?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class SchedulePeriodDto {
  @IsInt()
  @Min(0)
  dayOfWeek!: number;

  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora de inicio debe tener formato HH:mm.',
  })
  startsAt!: string;

  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora de fin debe tener formato HH:mm.',
  })
  endsAt!: string;
}

export class ReplaceSchedulesDto {
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => SchedulePeriodDto)
  schedules!: SchedulePeriodDto[];
}

export class ImageUrlDto {
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'La imagen debe usar una URL HTTPS válida.' },
  )
  @MaxLength(2048)
  url!: string;
}

export class RejectLocationDto {
  @IsString()
  @Length(5, 500, {
    message: 'El motivo de rechazo debe tener entre 5 y 500 caracteres.',
  })
  reason!: string;
}

export class CreateStaffDto {
  @IsString()
  @Length(2, 160, { message: 'El nombre debe tener entre 2 y 160 caracteres.' })
  fullName!: string;

  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsUUID('4', { message: 'Selecciona una sede válida.' })
  locationId!: string;

  // El restaurante define la contraseña inicial y la comunica al empleado
  // por su canal seguro hasta que se integre el proveedor de correo.
  @IsString()
  @Length(8, 128, {
    message: 'La contraseña debe tener entre 8 y 128 caracteres.',
  })
  @Matches(/(?=.*[A-Z])(?=.*\d)/, {
    message: 'La contraseña debe incluir una mayúscula y un número.',
  })
  initialPassword!: string;
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @Length(2, 160, { message: 'El nombre debe tener entre 2 y 160 caracteres.' })
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class ReassignStaffLocationDto {
  @IsUUID('4', { message: 'Selecciona una sede válida.' })
  locationId!: string;
}

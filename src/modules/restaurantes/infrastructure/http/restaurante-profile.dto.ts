import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  @Length(2, 160, { message: 'La razón social debe tener entre 2 y 160 caracteres.' })
  businessName!: string;
}

export class CreateLocationDto {
  @IsString()
  @Length(2, 120, { message: 'El nombre debe tener entre 2 y 120 caracteres.' })
  name!: string;

  @IsOptional() @IsString()
  @MaxLength(2000, { message: 'La descripción no puede superar 2000 caracteres.' })
  description?: string;

  @IsString()
  @Length(5, 250, { message: 'La dirección debe tener entre 5 y 250 caracteres.' })
  address!: string;

  @IsOptional() @IsLatitude()
  latitude?: number;

  @IsOptional() @IsLongitude()
  longitude?: number;
}

export class UpdateLocationDto {
  @IsOptional() @IsString() @Length(2, 120, { message: 'El nombre debe tener entre 2 y 120 caracteres.' })
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000, { message: 'La descripción no puede superar 2000 caracteres.' })
  description?: string;

  @IsOptional() @IsString() @Length(5, 250, { message: 'La dirección debe tener entre 5 y 250 caracteres.' })
  address?: string;

  @IsOptional() @IsLatitude()
  latitude?: number;

  @IsOptional() @IsLongitude()
  longitude?: number;
}

export class SchedulePeriodDto {
  @IsInt() @Min(0)
  dayOfWeek!: number;

  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'La hora de inicio debe tener formato HH:mm.' })
  startsAt!: string;

  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'La hora de fin debe tener formato HH:mm.' })
  endsAt!: string;
}

export class ReplaceSchedulesDto {
  @IsArray() @ArrayMaxSize(28)
  @ValidateNested({ each: true }) @Type(() => SchedulePeriodDto)
  schedules!: SchedulePeriodDto[];
}

export class ImageUrlDto {
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'La imagen debe usar una URL HTTPS válida.' })
  @MaxLength(2048)
  url!: string;
}

export class RejectLocationDto {
  @IsString()
  @Length(5, 500, { message: 'El motivo de rechazo debe tener entre 5 y 500 caracteres.' })
  reason!: string;
}

import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MENSAJE_FECHA = 'La fecha debe tener el formato AAAA-MM-DD.';

export class RangoFechasQueryDto {
  @IsString()
  @Matches(FECHA, { message: MENSAJE_FECHA })
  desde!: string;

  @IsString()
  @Matches(FECHA, { message: MENSAJE_FECHA })
  hasta!: string;
}

export class ResumenRestauranteQueryDto extends RangoFechasQueryDto {
  @IsOptional()
  @IsUUID()
  restauranteId?: string;
}

export class ReporteRestauranteQueryDto extends ResumenRestauranteQueryDto {
  @IsIn(['pdf', 'xlsx'], { message: 'El formato debe ser pdf o xlsx.' })
  formato!: 'pdf' | 'xlsx';
}

export class AfiliadosQueryDto extends RangoFechasQueryDto {
  @IsOptional()
  @IsIn(['restaurante', 'repartidor'])
  tipo?: 'restaurante' | 'repartidor';

  @IsOptional()
  @IsUUID()
  afiliadoId?: string;
}

export class TendenciasQueryDto extends RangoFechasQueryDto {
  @IsOptional()
  @IsUUID()
  restauranteId?: string;
}

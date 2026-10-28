import { IsOptional, IsUUID } from 'class-validator';
import { RangoFechasQueryDto } from '../../../estadisticas/application/dto/estadisticas.dto';

export class InsightAdminDto extends RangoFechasQueryDto {}

export class InsightRestauranteDto extends RangoFechasQueryDto {
  @IsOptional()
  @IsUUID()
  restauranteId?: string;
}

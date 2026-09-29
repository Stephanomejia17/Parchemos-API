import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Matches, Max } from 'class-validator';
import { MesaStatus } from '../../domain/enums/mesa-status.enum';

export class UpdateMesaDto {
  @IsOptional() @IsEnum(MesaStatus)
  status?: MesaStatus;
  @IsOptional() @IsString() @IsNotEmpty() @Matches(/^[1-9]\d*$/, { message: 'El número de mesa debe ser un entero positivo sin letras ni caracteres especiales.' })
  code?: string;
  @IsOptional() @IsInt() @IsPositive() @Max(50)
  capacity?: number;
}

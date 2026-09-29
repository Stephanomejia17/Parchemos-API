import { IsInt, IsNotEmpty, IsPositive, IsString, Matches, Max } from 'class-validator';

export class CreateMesaDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[1-9]\d*$/, { message: 'El número de mesa debe ser un entero positivo sin letras ni caracteres especiales.' })
  code!: string;

  @IsInt()
  @IsPositive()
  @Max(50)
  capacity!: number;
}

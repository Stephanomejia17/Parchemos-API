import { IsUUID, Matches } from 'class-validator';

export class PublicMesaByCodeDto {
  @IsUUID()
  locationId!: string;

  @Matches(/^[1-9]\d*$/, {
    message: 'El número de mesa debe ser un entero positivo.',
  })
  code!: string;
}

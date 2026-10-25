import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePedidoItemDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class CreatePedidoDto {
  @IsUUID()
  locationId!: string;

  @IsUUID()
  @IsOptional()
  tableId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoItemDto)
  items!: CreatePedidoItemDto[];
}

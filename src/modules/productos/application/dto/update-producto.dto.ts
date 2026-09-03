import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { ProductCategory, ProductStatus } from '../../../../../generated/prisma/client';

export class UpdateProductoDto {
  @IsOptional() @IsString() @Length(1, 160)
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99)
  price?: number;

  @IsOptional() @IsEnum(ProductStatus)
  status?: ProductStatus;
}

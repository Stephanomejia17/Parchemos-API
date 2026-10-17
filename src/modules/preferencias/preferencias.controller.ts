import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PreferenciasService } from './preferencias.service';

export class SavePreferencesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID('all', { each: true })
  cuisineIds!: string[];

  /** 1..4 ($..$$$$). Debe venir junto con `priceRangeMax`, o ambos nulos. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  priceRangeMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  priceRangeMax?: number | null;
}

@Controller('preferencias')
@Roles(Role.COMENSAL)
export class PreferenciasController {
  constructor(private readonly preferencias: PreferenciasService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.preferencias.get(user.id);
  }

  @Put()
  @HttpCode(204)
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SavePreferencesDto,
  ) {
    await this.preferencias.save(user.id, {
      cuisineIds: body.cuisineIds,
      priceRangeMin: body.priceRangeMin ?? null,
      priceRangeMax: body.priceRangeMax ?? null,
    });
  }
}

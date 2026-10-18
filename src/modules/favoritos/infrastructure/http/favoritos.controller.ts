import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import {
  OptionalAuth,
  Public,
} from '../../../../common/decorators/public.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import {
  AddFavoriteUseCase,
  ListFavoritesUseCase,
  ListFeaturedLocationsUseCase,
  MAX_FEATURED_LIMIT,
  RemoveFavoriteUseCase,
} from '../../application/favorites.use-cases';

export class AddFavoriteDto {
  @IsUUID()
  locationId!: string;
}

export class FeaturedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_FEATURED_LIMIT)
  limit?: number;
}

/**
 * DO-05: favoritos del comensal. RN6: solo el rol comensal los gestiona y
 * cada quien opera unicamente sobre su propia lista (el usuario sale del token).
 */
@Controller('favoritos')
@Roles(Role.COMENSAL)
export class FavoritosController {
  constructor(
    private readonly addFavorite: AddFavoriteUseCase,
    private readonly removeFavorite: RemoveFavoriteUseCase,
    private readonly listFavorites: ListFavoritesUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.listFavorites.execute(user.id);
  }

  @Post()
  @HttpCode(201)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AddFavoriteDto,
  ) {
    await this.addFavorite.execute(user.id, body.locationId);
    return { locationId: body.locationId, esFavorito: true };
  }

  @Delete(':locationId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    await this.removeFavorite.execute(user.id, locationId);
  }
}

/** DO-02: destacados. Abierto a visitantes; con sesion marca los favoritos propios. */
@Controller('restaurantes')
export class DestacadosController {
  constructor(private readonly listFeatured: ListFeaturedLocationsUseCase) {}

  @Get('destacados')
  @Public()
  @OptionalAuth()
  featured(
    @Query() query: FeaturedQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.listFeatured.execute({ limit: query.limit, userId: user?.id });
  }
}

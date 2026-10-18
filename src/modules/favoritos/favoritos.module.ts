import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import {
  AddFavoriteUseCase,
  ListFavoritesUseCase,
  ListFeaturedLocationsUseCase,
  RemoveFavoriteUseCase,
} from './application/favorites.use-cases';
import { FAVORITE_REPOSITORY } from './domain/favorite.repository';
import {
  DestacadosController,
  FavoritosController,
} from './infrastructure/http/favoritos.controller';
import { PrismaFavoriteRepository } from './infrastructure/persistence/prisma-favorite.repository';

@Module({
  imports: [RestaurantsModule],
  controllers: [FavoritosController, DestacadosController],
  providers: [
    AddFavoriteUseCase,
    RemoveFavoriteUseCase,
    ListFavoritesUseCase,
    ListFeaturedLocationsUseCase,
    { provide: FAVORITE_REPOSITORY, useClass: PrismaFavoriteRepository },
  ],
})
export class FavoritosModule {}

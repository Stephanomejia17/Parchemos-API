import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { GetRecommendationsUseCase } from './application/get-recommendations.use-case';
import { RECOMMENDATION_SOURCE } from './domain/recommendation-source';
import { RecomendacionesController } from './infrastructure/http/recomendaciones.controller';
import { PrismaRecommendationSource } from './infrastructure/prisma-recommendation-source';

@Module({
  imports: [RestaurantsModule],
  controllers: [RecomendacionesController],
  providers: [
    GetRecommendationsUseCase,
    { provide: RECOMMENDATION_SOURCE, useClass: PrismaRecommendationSource },
  ],
})
export class RecomendacionesModule {}

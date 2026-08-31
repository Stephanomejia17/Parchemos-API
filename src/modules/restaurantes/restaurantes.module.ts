import { Module } from '@nestjs/common';
import { RestaurantProfilesService } from './application/restaurant-profiles.service';
import { RestaurantesController } from './infrastructure/http/restaurantes.controller';

@Module({
  controllers: [RestaurantesController],
  providers: [RestaurantProfilesService],
})
export class RestaurantesModule {}

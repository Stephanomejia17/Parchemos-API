import { Module } from '@nestjs/common';
import { RestaurantesController } from './infrastructure/http/restaurantes.controller';

@Module({
  controllers: [RestaurantesController],
})
export class RestaurantesModule {}

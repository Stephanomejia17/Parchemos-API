import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RestaurantProfilesService } from './application/restaurant-profiles.service';
import { RestaurantStaffService } from './application/restaurant-staff.service';
import { RestaurantesController } from './infrastructure/http/restaurantes.controller';

@Module({
  imports: [AuthModule],
  controllers: [RestaurantesController],
  providers: [RestaurantProfilesService, RestaurantStaffService],
})
export class RestaurantesModule {}

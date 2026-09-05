import { Inject, Injectable } from '@nestjs/common';
import { RESTAURANT_REPOSITORY } from '../../domain/repositories/restaurant.repository';
import type {
  RestaurantRepository,
  RestaurantWithLocations,
} from '../../domain/repositories/restaurant.repository';

@Injectable()
export class ListMyRestaurantsUseCase {
  constructor(
    @Inject(RESTAURANT_REPOSITORY)
    private readonly restaurants: RestaurantRepository,
  ) {}

  execute(ownerId: string): Promise<RestaurantWithLocations[]> {
    return this.restaurants.findManyByOwnerWithLocations(ownerId);
  }
}

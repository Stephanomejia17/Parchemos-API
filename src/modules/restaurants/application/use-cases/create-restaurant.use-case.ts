import { Inject, Injectable } from '@nestjs/common';
import { Restaurant } from '../../domain/entities/restaurant.entity';
import { RESTAURANT_REPOSITORY } from '../../domain/repositories/restaurant.repository';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';
import { CreateRestaurantCommand } from '../dto/restaurant.commands';

/** AN-01: una cuenta restaurante puede crear y administrar varias empresas. */
@Injectable()
export class CreateRestaurantUseCase {
  constructor(
    @Inject(RESTAURANT_REPOSITORY)
    private readonly restaurants: RestaurantRepository,
  ) {}

  execute(
    ownerId: string,
    command: CreateRestaurantCommand,
  ): Promise<Restaurant> {
    return this.restaurants.create({
      ownerId,
      businessName: command.businessName.trim(),
    });
  }
}

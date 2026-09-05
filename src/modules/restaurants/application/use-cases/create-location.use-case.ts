import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { Location } from '../../domain/entities/location.entity';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { RESTAURANT_REPOSITORY } from '../../domain/repositories/restaurant.repository';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';
import { assertValidCoordinates } from '../../domain/services/coordinates-validator';
import { CreateLocationCommand } from '../dto/restaurant.commands';

@Injectable()
export class CreateLocationUseCase {
  constructor(
    @Inject(RESTAURANT_REPOSITORY)
    private readonly restaurants: RestaurantRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(
    ownerId: string,
    restaurantId: string,
    command: CreateLocationCommand,
  ): Promise<Location> {
    const restaurant = await this.restaurants.findByIdAndOwner(
      restaurantId,
      ownerId,
    );
    if (!restaurant) {
      throw new ForbiddenError(
        'No puedes administrar este restaurante.',
        'RESTAURANT_NOT_OWNED',
      );
    }
    assertValidCoordinates(command);

    return this.locations.create({
      restaurantId,
      name: command.name.trim(),
      description: command.description?.trim() || null,
      address: command.address.trim(),
      latitude: command.latitude,
      longitude: command.longitude,
    });
  }
}

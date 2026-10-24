import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { Location } from '../../domain/entities/location.entity';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { RESTAURANT_REPOSITORY } from '../../domain/repositories/restaurant.repository';
import type { RestaurantRepository } from '../../domain/repositories/restaurant.repository';
import { CreateLocationCommand } from '../dto/restaurant.commands';
import { GeoapifyGeocodingService } from '../../infrastructure/geocoding/geoapify-geocoding.service';

@Injectable()
export class CreateLocationUseCase {
  constructor(
    @Inject(RESTAURANT_REPOSITORY)
    private readonly restaurants: RestaurantRepository,
    @Inject(LOCATION_REPOSITORY)
    private readonly locations: LocationRepository,
    private readonly geocoding: GeoapifyGeocodingService,
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

    const address = command.address.trim();
    const geocoded = await this.geocoding.geocode(address);

    return this.locations.create({
      restaurantId,
      name: command.name.trim(),
      description: command.description?.trim() || null,
      address,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
    });
  }
}
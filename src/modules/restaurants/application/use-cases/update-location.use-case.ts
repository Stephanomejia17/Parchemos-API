import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { Location } from '../../domain/entities/location.entity';
import { LocationStatus } from '../../domain/enums/location-status.enum';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';
import { UpdateLocationCommand } from '../dto/restaurant.commands';
import { AddressGeocodingService } from '../../infrastructure/geocoding/address-geocoding.service';

/** Editar una sede aprobada la vuelve a poner en revision (AN-01). */
@Injectable()
export class UpdateLocationUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY)
    private readonly locations: LocationRepository,
    private readonly geocoding: AddressGeocodingService,
  ) {}

  async execute(
    ownerId: string,
    locationId: string,
    command: UpdateLocationCommand,
  ): Promise<Location> {
    const location = await this.locations.findByIdAndOwner(locationId, ownerId);

    if (!location) {
      throw new ForbiddenError(
        'No puedes administrar esta sede.',
        'LOCATION_NOT_OWNED',
      );
    }

    const addressChanged =
      command.address !== undefined &&
      command.address.trim() !== location.address;
    // Las sedes creadas antes de la geocodificacion no tienen coordenadas y no
    // aparecen en el mapa; al guardar su direccion (aunque no cambie) se ubican.
    const missingCoordinates =
      location.latitude === null || location.longitude === null;
    const shouldGeocode =
      command.address !== undefined && (addressChanged || missingCoordinates);

    const geocoded = shouldGeocode
      ? await this.geocoding.geocode(command.address!.trim())
      : null;

    return this.locations.update(locationId, {
      ...(command.name !== undefined ? { name: command.name.trim() } : {}),
      ...(command.description !== undefined
        ? { description: command.description.trim() }
        : {}),
      ...(command.address !== undefined
        ? { address: geocoded?.formattedAddress ?? command.address.trim() }
        : {}),
      ...(geocoded
        ? {
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
          }
        : {}),
      ...(location.isActive()
        ? { status: LocationStatus.PENDING_APPROVAL }
        : {}),
    });
  }
}

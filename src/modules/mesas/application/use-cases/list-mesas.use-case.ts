import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { MESA_REPOSITORY } from '../../domain/repositories/mesa.repository';
import type { MesaRepository } from '../../domain/repositories/mesa.repository';

@Injectable()
export class ListMesasUseCase {
  constructor(
    @Inject(MESA_REPOSITORY) private readonly mesas: MesaRepository,
  ) {}

  async execute(ownerId: string, locationId: string) {
    const belongsToOwner = await this.mesas.locationBelongsToOwner(
      locationId,
      ownerId,
    );
    if (!belongsToOwner)
      throw new ForbiddenError('La sede no pertenece a tu restaurante.');
    return this.mesas.listByLocation(locationId);
  }
}

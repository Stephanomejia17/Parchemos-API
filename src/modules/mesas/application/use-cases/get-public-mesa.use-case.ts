import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { MESA_REPOSITORY } from '../../domain/repositories/mesa.repository';
import type { MesaRepository } from '../../domain/repositories/mesa.repository';
import { MesaStatus } from '../../domain/enums/mesa-status.enum';

@Injectable()
export class GetPublicMesaUseCase {
  constructor(
    @Inject(MESA_REPOSITORY) private readonly mesas: MesaRepository,
  ) {}

  async execute(tableId: string) {
    const result = await this.mesas.findPublicById(tableId);
    if (!result || result.mesa.status !== MesaStatus.ACTIVA) {
      throw new NotFoundError(
        'La mesa no está disponible para recibir pedidos.',
        'TABLE_NOT_AVAILABLE',
      );
    }
    return {
      tableId: result.mesa.id,
      tableCode: result.mesa.code,
      capacity: result.mesa.capacity,
      locationId: result.mesa.locationId,
      restaurantId: result.restaurantId,
      restaurantName: result.restaurantName,
    };
  }
}

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
    return this.toPublicResponse(result);
  }

  async executeByCode(locationId: string, code: string) {
    const result = await this.mesas.findPublicByCode(locationId, code);
    return this.toPublicResponse(result);
  }

  private toPublicResponse(
    result: Awaited<ReturnType<MesaRepository['findPublicById']>>,
  ) {
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

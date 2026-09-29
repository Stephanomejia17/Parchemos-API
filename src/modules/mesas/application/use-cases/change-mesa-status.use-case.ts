import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { MESA_REPOSITORY } from '../../domain/repositories/mesa.repository';
import type { MesaRepository, UpdateMesaData } from '../../domain/repositories/mesa.repository';
import { MesaStatus } from '../../domain/enums/mesa-status.enum';

@Injectable()
export class ChangeMesaStatusUseCase {
  constructor(
    @Inject(MESA_REPOSITORY) private readonly mesas: MesaRepository,
  ) {}

  async execute(ownerId: string, tableId: string, data: UpdateMesaData | MesaStatus) {
    const table = await this.mesas.findOwnedById(tableId, ownerId);
    if (!table)
      throw new NotFoundError(
        'La mesa no existe en tu restaurante.',
        'TABLE_NOT_FOUND',
      );
    return typeof data === 'string'
      ? this.mesas.updateStatus(table.id, data)
      : this.mesas.update(table.id, { ...data, code: data.code?.trim() });
  }
}

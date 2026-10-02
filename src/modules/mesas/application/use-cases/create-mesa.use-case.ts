import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { MESA_REPOSITORY } from '../../domain/repositories/mesa.repository';
import type { MesaRepository } from '../../domain/repositories/mesa.repository';
import { ValidationError } from '../../../../common/errors/validation-error';

export interface CreateMesaCommand {
  code: string;
  capacity?: number;
}

@Injectable()
export class CreateMesaUseCase {
  constructor(
    @Inject(MESA_REPOSITORY) private readonly mesas: MesaRepository,
  ) {}

  async execute(
    ownerId: string,
    locationId: string,
    command: CreateMesaCommand,
  ) {
    if (!/^[1-9]\d*$/.test(command.code.trim()))
      throw new ValidationError('El número de mesa debe ser un entero positivo.');
    const existing = await this.mesas.listByLocation(locationId);
    const nextNumber = existing.reduce((max, mesa) => Math.max(max, Number(mesa.code) || 0), 0) + 1;
    if (Number(command.code.trim()) !== nextNumber)
      throw new ValidationError(`La nueva mesa debe usar el número incremental ${nextNumber}.`);
    const belongsToOwner = await this.mesas.locationBelongsToOwner(
      locationId,
      ownerId,
    );
    if (!belongsToOwner)
      throw new ForbiddenError('La sede no pertenece a tu restaurante.');
    return this.mesas.create({
      locationId,
      code: command.code.trim(),
      capacity: command.capacity ?? 1,
    });
  }
}

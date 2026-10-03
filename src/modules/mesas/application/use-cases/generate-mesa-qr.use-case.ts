import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { MESA_REPOSITORY } from '../../domain/repositories/mesa.repository';
import type { MesaRepository } from '../../domain/repositories/mesa.repository';
import {
  MESA_PUBLIC_URL_BUILDER,
  MESA_QR_GENERATOR,
} from '../../domain/services/mesa-qr';
import type {
  MesaPublicUrlBuilder,
  MesaQrGenerator,
} from '../../domain/services/mesa-qr';
import { MesaStatus } from '../../domain/enums/mesa-status.enum';

@Injectable()
export class GenerateMesaQrUseCase {
  constructor(
    @Inject(MESA_REPOSITORY) private readonly mesas: MesaRepository,
    @Inject(MESA_QR_GENERATOR) private readonly qr: MesaQrGenerator,
    @Inject(MESA_PUBLIC_URL_BUILDER)
    private readonly urls: MesaPublicUrlBuilder,
  ) {}

  async execute(tableId: string): Promise<Buffer> {
    const mesa = await this.mesas.findById(tableId);
    if (!mesa || mesa.status !== MesaStatus.ACTIVA) {
      throw new NotFoundError(
        'El QR de esta mesa ya no es válido.',
        'TABLE_QR_NOT_AVAILABLE',
      );
    }
    return this.qr.generatePng(this.urls.build(mesa.id));
  }
}


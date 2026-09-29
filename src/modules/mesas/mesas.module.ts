import { Module } from '@nestjs/common';
import { ChangeMesaStatusUseCase } from './application/use-cases/change-mesa-status.use-case';
import { CreateMesaUseCase } from './application/use-cases/create-mesa.use-case';
import { GenerateMesaQrUseCase } from './application/use-cases/generate-mesa-qr.use-case';
import { GetPublicMesaUseCase } from './application/use-cases/get-public-mesa.use-case';
import { ListMesasUseCase } from './application/use-cases/list-mesas.use-case';
import { MESA_REPOSITORY } from './domain/repositories/mesa.repository';
import {
  MESA_PUBLIC_URL_BUILDER,
  MESA_QR_GENERATOR,
} from './domain/services/mesa-qr';
import { MesasController } from './infrastructure/http/mesas.controller';
import { PrismaMesaRepository } from './infrastructure/persistence/prisma-mesa.repository';
import { MesaPublicUrlBuilder } from './infrastructure/qr/mesa-public-url.builder';
import { QrCodeGenerator } from './infrastructure/qr/qrcode-generator';

@Module({
  controllers: [MesasController],
  providers: [
    ListMesasUseCase,
    CreateMesaUseCase,
    ChangeMesaStatusUseCase,
    GetPublicMesaUseCase,
    GenerateMesaQrUseCase,
    { provide: MESA_REPOSITORY, useClass: PrismaMesaRepository },
    { provide: MESA_QR_GENERATOR, useClass: QrCodeGenerator },
    { provide: MESA_PUBLIC_URL_BUILDER, useClass: MesaPublicUrlBuilder },
  ],
})
export class MesasModule {}

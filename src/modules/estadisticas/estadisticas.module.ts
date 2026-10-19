import { Module } from '@nestjs/common';
import { EstadisticasService } from './application/estadisticas.service';
import { ESTADISTICAS_REPOSITORY } from './domain/repositories/estadisticas.repository';
import { EstadisticasController } from './infraestructure/http/estadisticas.controller';
import { PrismaEstadisticasRepository } from './infraestructure/persistence/prisma-estadisticas.repository';

@Module({
  controllers: [EstadisticasController],
  providers: [
    EstadisticasService,
    {
      provide: ESTADISTICAS_REPOSITORY,
      useClass: PrismaEstadisticasRepository,
    },
  ],
})
export class EstadisticasModule {}

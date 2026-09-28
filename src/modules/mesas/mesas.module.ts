import { Module } from '@nestjs/common';
import { MesasController } from './infrastructure/http/mesas.controller';
import { MesasService } from './application/mesas.service';

@Module({ controllers: [MesasController], providers: [MesasService], exports: [MesasService] })
export class MesasModule {}

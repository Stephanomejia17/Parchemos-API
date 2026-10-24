import { Module } from '@nestjs/common';
import { EncuestasService } from './application/encuestas.service';
import { EncuestasController } from './infrastructure/http/encuestas.controller';

@Module({ controllers: [EncuestasController], providers: [EncuestasService] })
export class EncuestasModule {}

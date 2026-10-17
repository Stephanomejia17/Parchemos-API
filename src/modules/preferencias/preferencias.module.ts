import { Module } from '@nestjs/common';
import { PreferenciasController } from './preferencias.controller';
import { PreferenciasService } from './preferencias.service';

@Module({
  controllers: [PreferenciasController],
  providers: [PreferenciasService],
})
export class PreferenciasModule {}

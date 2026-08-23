import { Module } from '@nestjs/common';
import { ResenasController } from './infrastructure/http/resenas.controller';

@Module({
  controllers: [ResenasController],
})
export class ResenasModule {}

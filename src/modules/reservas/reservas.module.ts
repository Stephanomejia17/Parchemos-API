import { Module } from '@nestjs/common';
import { ReservasController } from './infrastructure/http/reservas.controller';

@Module({
  controllers: [ReservasController],
})
export class ReservasModule {}

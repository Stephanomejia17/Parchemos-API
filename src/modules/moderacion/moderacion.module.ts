import { Module } from '@nestjs/common';
import { ModeracionController } from './infrastructure/http/moderacion.controller';
import { ModeracionService } from './application/moderacion.service';

@Module({
  controllers: [ModeracionController],
  providers: [ModeracionService],
})
export class ModeracionModule {}

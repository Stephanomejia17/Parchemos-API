import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Health check: unico endpoint abierto fuera de /auth. */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}

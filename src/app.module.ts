import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { PedidosModule } from './modules/pedidos/pedidos.module';
import { ResenasModule } from './modules/resenas/resenas.module';
import { ReservasModule } from './modules/reservas/reservas.module';
import { RestaurantesModule } from './modules/restaurantes/restaurantes.module';

@Module({
  imports: [AuthModule, RestaurantesModule, PedidosModule, ReservasModule, ResenasModule],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/infrastructure/guards/jwt-auth.guard';
import { PedidosModule } from './modules/pedidos/pedidos.module';
import { ResenasModule } from './modules/resenas/resenas.module';
import { ReservasModule } from './modules/reservas/reservas.module';
import { RestaurantesModule } from './modules/restaurantes/restaurantes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    // Limite general de peticiones; los endpoints sensibles lo aprietan mas
    // con @Throttle (ver AuthController).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    RestaurantesModule,
    PedidosModule,
    ReservasModule,
    ResenasModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // El orden importa: primero se limita el trafico, luego se exige token y
    // por ultimo se comprueba el rol.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}

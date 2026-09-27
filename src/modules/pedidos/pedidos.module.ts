import { Module } from '@nestjs/common';
import { PedidosController } from './infrastructure/http/pedidos.controller';
import { PedidosGateway } from './infrastructure/realtime/pedidos.gateway';
import { PedidosService } from './application/pedidos.service';

@Module({
  controllers: [PedidosController],
  providers: [PedidosGateway, PedidosService],
})
export class PedidosModule {}

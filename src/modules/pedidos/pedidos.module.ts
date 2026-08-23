import { Module } from '@nestjs/common';
import { PedidosController } from './infrastructure/http/pedidos.controller';
import { PedidosGateway } from './infrastructure/realtime/pedidos.gateway';

@Module({
  controllers: [PedidosController],
  providers: [PedidosGateway],
})
export class PedidosModule {}

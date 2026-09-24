import { Module } from '@nestjs/common';
import { ConfirmarPedidoUseCase } from './application/use-cases/confirmar-pedido.use-case';
import { PEDIDO_REPOSITORY } from './domain/repositories/pedido.repository';
import { PedidosController } from './infrastructure/http/pedidos.controller';
import { PrismaPedidoRepository } from './infrastructure/persistence/prisma-pedido.repository';
import { PedidosGateway } from './infrastructure/realtime/pedidos.gateway';

@Module({
  controllers: [PedidosController],
  providers: [
    ConfirmarPedidoUseCase,
    PedidosGateway,
    { provide: PEDIDO_REPOSITORY, useClass: PrismaPedidoRepository },
  ],
})
export class PedidosModule {}

import { Module } from '@nestjs/common';
import { CambiarEstadoPedidoUseCase } from './application/use-cases/cambiar-estado-pedido.use-case';
import { ConfirmarPedidoUseCase } from './application/use-cases/confirmar-pedido.use-case';
import {
  ConsultarEstadoPedidoUseCase,
  ListarMisPedidosUseCase,
} from './application/use-cases/consultar-estado-pedido.use-case';
import { PedidoAccess } from './application/use-cases/pedido-access';
import { PEDIDO_REPOSITORY } from './domain/repositories/pedido.repository';
import { PedidosController } from './infrastructure/http/pedidos.controller';
import { PrismaPedidoRepository } from './infrastructure/persistence/prisma-pedido.repository';
import { PedidosGateway } from './infrastructure/realtime/pedidos.gateway';

@Module({
  controllers: [PedidosController],
  providers: [
    PedidoAccess,
    ConfirmarPedidoUseCase,
    ConsultarEstadoPedidoUseCase,
    ListarMisPedidosUseCase,
    CambiarEstadoPedidoUseCase,
    PedidosGateway,
    { provide: PEDIDO_REPOSITORY, useClass: PrismaPedidoRepository },
  ],
})
export class PedidosModule {}

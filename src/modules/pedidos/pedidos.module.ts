import { Module } from '@nestjs/common';
import { PedidosService } from './application/pedidos.service';
import { CambiarEstadoPedidoUseCase } from './application/use-cases/cambiar-estado-pedido.use-case';
import { ConfirmarPedidoUseCase } from './application/use-cases/confirmar-pedido.use-case';
import { ConsultarEstadoPedidoUseCase } from './application/use-cases/consultar-estado-pedido.use-case';
import { ConsultarHistorialPedidoUseCase } from './application/use-cases/consultar-historial-pedido.use-case';
import { ListarPedidosEnCursoDeSedeUseCase } from './application/use-cases/listar-pedidos-en-curso-de-sede.use-case';
import { ListarPedidosEnSalaUseCase } from './application/use-cases/listar-pedidos-en-sala.use-case';
import { ConsultarResumenSedeUseCase } from './application/use-cases/consultar-resumen-sede.use-case';
import { PedidoAccess } from './application/use-cases/pedido-access';
import { PEDIDO_REPOSITORY } from './domain/repositories/pedido.repository';
import { PEDIDO_EVENTOS } from './domain/services/pedido-eventos';
import { PedidosController } from './infrastructure/http/pedidos.controller';
import { PrismaPedidoRepository } from './infrastructure/persistence/prisma-pedido.repository';
import { PedidosGateway } from './infrastructure/realtime/pedidos.gateway';
import { SocketPedidoEventos } from './infrastructure/realtime/socket-pedido-eventos';

@Module({
  controllers: [PedidosController],
  providers: [
    PedidosService,
    PedidoAccess,
    ConfirmarPedidoUseCase,
    ConsultarEstadoPedidoUseCase,
    CambiarEstadoPedidoUseCase,
    ConsultarHistorialPedidoUseCase,
    ListarPedidosEnCursoDeSedeUseCase,
    ListarPedidosEnSalaUseCase,
    ConsultarResumenSedeUseCase,
    PedidosGateway,
    { provide: PEDIDO_REPOSITORY, useClass: PrismaPedidoRepository },
    { provide: PEDIDO_EVENTOS, useClass: SocketPedidoEventos },
  ],
})
export class PedidosModule {}

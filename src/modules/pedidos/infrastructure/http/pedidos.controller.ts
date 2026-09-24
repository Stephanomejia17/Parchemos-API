import {
  Controller,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { CambiarEstadoPedidoUseCase } from '../../application/use-cases/cambiar-estado-pedido.use-case';
import { ConfirmarPedidoUseCase } from '../../application/use-cases/confirmar-pedido.use-case';
import {
  ConsultarEstadoPedidoUseCase,
  ListarMisPedidosUseCase,
} from '../../application/use-cases/consultar-estado-pedido.use-case';
import { ConsultarHistorialPedidoUseCase } from '../../application/use-cases/consultar-historial-pedido.use-case';
import { CambiarEstadoPedidoDto } from './cambiar-estado-pedido.dto';
import { toPedidoEstadoResponse } from './pedido.presenter';

@Controller('pedidos')
export class PedidosController {
  constructor(
    private readonly confirmarPedido: ConfirmarPedidoUseCase,
    private readonly consultarEstado: ConsultarEstadoPedidoUseCase,
    private readonly listarMisPedidos: ListarMisPedidosUseCase,
    private readonly cambiarEstado: CambiarEstadoPedidoUseCase,
    private readonly consultarHistorial: ConsultarHistorialPedidoUseCase,
  ) {}

  @Get('mios')
  @Roles(Role.COMENSAL)
  async mios(@CurrentUser() user: AuthenticatedUser) {
    const pedidos = await this.listarMisPedidos.execute(user.id);
    return {
      success: true,
      data: pedidos.map(toPedidoEstadoResponse),
      message: 'Pedidos consultados correctamente.',
    };
  }

  @Get(':id/estado')
  @Roles(
    Role.COMENSAL,
    Role.RESTAURANTE,
    Role.PERSONAL_RESTAURANTE,
    Role.ADMINISTRADOR,
  )
  async estado(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const pedido = await this.consultarEstado.execute(id, user);
    return {
      success: true,
      data: toPedidoEstadoResponse(pedido),
      message: 'Estado del pedido consultado correctamente.',
    };
  }

  @Get(':id/historial')
  @Roles(
    Role.COMENSAL,
    Role.RESTAURANTE,
    Role.PERSONAL_RESTAURANTE,
    Role.ADMINISTRADOR,
  )
  async historial(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      data: await this.consultarHistorial.execute(id, user),
      message: 'Historial del pedido consultado correctamente.',
    };
  }

  @Patch(':id/estado')
  @Roles(Role.RESTAURANTE, Role.PERSONAL_RESTAURANTE, Role.ADMINISTRADOR)
  async actualizarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CambiarEstadoPedidoDto,
  ) {
    const pedido = await this.cambiarEstado.execute(id, user, dto);
    return {
      success: true,
      data: toPedidoEstadoResponse(pedido),
      message: 'Estado del pedido actualizado.',
    };
  }

  @Post(':id/confirmar')
  @Roles(Role.COMENSAL)
  @HttpCode(HttpStatus.OK)
  async confirmar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const pedido = await this.confirmarPedido.execute(id, user.id);
    return {
      success: true,
      data: toPedidoEstadoResponse(pedido),
      message: 'Pedido confirmado.',
    };
  }
}

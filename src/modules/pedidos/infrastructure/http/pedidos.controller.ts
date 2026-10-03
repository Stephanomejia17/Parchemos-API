import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { CreatePedidoDto } from '../../application/dto/create-pedido.dto';
import { PedidosService } from '../../application/pedidos.service';
import { CambiarEstadoPedidoUseCase } from '../../application/use-cases/cambiar-estado-pedido.use-case';
import { ConfirmarPedidoUseCase } from '../../application/use-cases/confirmar-pedido.use-case';
import { ConsultarEstadoPedidoUseCase } from '../../application/use-cases/consultar-estado-pedido.use-case';
import { ConsultarHistorialPedidoUseCase } from '../../application/use-cases/consultar-historial-pedido.use-case';
import { ListarPedidosEnCursoDeSedeUseCase } from '../../application/use-cases/listar-pedidos-en-curso-de-sede.use-case';
import { ListarPedidosEnSalaUseCase } from '../../application/use-cases/listar-pedidos-en-sala.use-case';
import { ConsultarResumenSedeUseCase } from '../../application/use-cases/consultar-resumen-sede.use-case';
import { ROLES_GESTORES } from '../../application/use-cases/pedido-access';
import { CambiarEstadoPedidoDto } from './cambiar-estado-pedido.dto';
import {
  toMesaConPedidosResponse,
  toPedidoEstadoResponse,
} from './pedido.presenter';

const ROLES_LECTORES = [Role.COMENSAL, ...ROLES_GESTORES];

@Controller('pedidos')
export class PedidosController {
  constructor(
    private readonly pedidos: PedidosService,
    private readonly confirmarPedido: ConfirmarPedidoUseCase,
    private readonly consultarEstado: ConsultarEstadoPedidoUseCase,
    private readonly cambiarEstado: CambiarEstadoPedidoUseCase,
    private readonly consultarHistorial: ConsultarHistorialPedidoUseCase,
    private readonly listarEnCursoDeSede: ListarPedidosEnCursoDeSedeUseCase,
    private readonly listarEnSala: ListarPedidosEnSalaUseCase,
    private readonly consultarResumen: ConsultarResumenSedeUseCase,
  ) {}

  @Post()
  @Roles(Role.COMENSAL)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePedidoDto,
  ) {
    return {
      success: true,
      data: await this.pedidos.create(
        user.id,
        dto.locationId,
        dto.items,
        dto.tableId,
      ),
      message: 'Pedido registrado correctamente.',
    };
  }

  @Get('mios')
  @Roles(Role.COMENSAL)
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    return {
      success: true,
      data: await this.pedidos.listMine(user.id),
      message: 'Pedidos consultados correctamente.',
    };
  }

  @Get('sede/:sedeId')
  @Roles(...ROLES_GESTORES)
  async enCursoDeSede(
    @Param('sedeId', ParseUUIDPipe) sedeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const pedidos = await this.listarEnCursoDeSede.execute(sedeId, user);
    return {
      success: true,
      data: pedidos.map(toPedidoEstadoResponse),
      message: 'Pedidos en curso consultados correctamente.',
    };
  }

  @Get('sede/:sedeId/resumen')
  @Roles(...ROLES_GESTORES)
  async resumenDeSede(
    @Param('sedeId', ParseUUIDPipe) sedeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      data: await this.consultarResumen.execute(sedeId, user),
      message: 'Resumen de la sede consultado correctamente.',
    };
  }

  @Get('sede/:sedeId/mesas')
  @Roles(...ROLES_GESTORES)
  async enSalaPorMesa(
    @Param('sedeId', ParseUUIDPipe) sedeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const mesas = await this.listarEnSala.execute(sedeId, user);
    return {
      success: true,
      data: mesas.map(toMesaConPedidosResponse),
      message: 'Pedidos en sala consultados correctamente.',
    };
  }

  @Get(':id/estado')
  @Roles(...ROLES_LECTORES)
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
  @Roles(...ROLES_LECTORES)
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
  @Roles(...ROLES_GESTORES)
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

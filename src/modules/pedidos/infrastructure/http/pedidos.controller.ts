import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { CreatePedidoDto } from '../../application/dto/create-pedido.dto';
import { PedidosService } from '../../application/pedidos.service';
import { SharedTableOrdersService } from '../../application/shared-table-orders.service';
import {
  ReplaceSharedTableContributionDto,
  SelectSharedTablePayerDto,
} from '../../application/dto/shared-table-order.dto';
import { CambiarEstadoPedidoUseCase } from '../../application/use-cases/cambiar-estado-pedido.use-case';
import { ConfirmarPedidoUseCase } from '../../application/use-cases/confirmar-pedido.use-case';
import { ConsultarEstadoPedidoUseCase } from '../../application/use-cases/consultar-estado-pedido.use-case';
import { ConsultarHistorialPedidoUseCase } from '../../application/use-cases/consultar-historial-pedido.use-case';
import { ListarPedidosEnCursoDeSedeUseCase } from '../../application/use-cases/listar-pedidos-en-curso-de-sede.use-case';
import { ListarPedidosEntregadosDeSedeUseCase } from '../../application/use-cases/listar-pedidos-entregados-de-sede.use-case';
import { ListarPedidosEnSalaUseCase } from '../../application/use-cases/listar-pedidos-en-sala.use-case';
import { ConsultarResumenSedeUseCase } from '../../application/use-cases/consultar-resumen-sede.use-case';
import { ROLES_GESTORES } from '../../application/use-cases/pedido-access';
import { PedidoAccess } from '../../application/use-cases/pedido-access';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { CambiarEstadoPedidoDto } from './cambiar-estado-pedido.dto';
import {
  toMesaConPedidosResponse,
  toPedidoEnSalaResponse,
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
    private readonly listarEntregadosDeSede: ListarPedidosEntregadosDeSedeUseCase,
    private readonly listarEnSala: ListarPedidosEnSalaUseCase,
    private readonly consultarResumen: ConsultarResumenSedeUseCase,
    private readonly pedidosCompartidos: SharedTableOrdersService,
    private readonly prisma: PrismaService,
    private readonly pedidoAccess: PedidoAccess,
  ) {}

  @Post('mesas/:tableId/sesion')
  @Roles(Role.COMENSAL)
  async unirseAMesa(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableId', ParseUUIDPipe) tableId: string,
  ) {
    return {
      success: true,
      data: await this.pedidosCompartidos.join(tableId, user.id),
      message: 'Te vinculaste a la mesa.',
    };
  }

  @Get('mesas/:tableId/sesion')
  @Roles(Role.COMENSAL)
  async consultarMesaCompartida(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableId', ParseUUIDPipe) tableId: string,
  ) {
    return {
      success: true,
      data: await this.pedidosCompartidos.get(tableId, user.id),
      message: 'Pedido compartido consultado correctamente.',
    };
  }

  @Put('mesas/:tableId/sesion/contribucion')
  @Roles(Role.COMENSAL)
  async actualizarContribucionMesa(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableId', ParseUUIDPipe) tableId: string,
    @Body() dto: ReplaceSharedTableContributionDto,
  ) {
    return {
      success: true,
      data: await this.pedidosCompartidos.replaceContribution(
        tableId,
        user.id,
        dto.items,
      ),
      message: 'Tus productos se agregaron al pedido compartido.',
    };
  }

  @Patch('mesas/:tableId/sesion/pagador')
  @Roles(Role.COMENSAL)
  async seleccionarPagadorMesa(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableId', ParseUUIDPipe) tableId: string,
    @Body() dto: SelectSharedTablePayerDto,
  ) {
    return {
      success: true,
      data: await this.pedidosCompartidos.setPayer(
        tableId,
        user.id,
        dto.payerId,
      ),
      message: 'Responsable del pago actualizado.',
    };
  }

  @Post('mesas/:tableId/sesion/confirmar')
  @Roles(Role.COMENSAL)
  async confirmarMesaCompartida(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableId', ParseUUIDPipe) tableId: string,
  ) {
    return {
      success: true,
      data: await this.pedidosCompartidos.submit(tableId, user.id),
      message: 'Pedido compartido confirmado.',
    };
  }

  @Post('mesas/:tableId/cerrar-ocupacion')
  @Roles(...ROLES_GESTORES)
  async cerrarOcupacionMesa(
    @Param('tableId', ParseUUIDPipe) tableId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      data: await this.pedidosCompartidos.closeOccupancy(tableId, user),
      message: 'Pago presencial confirmado y ocupación finalizada.',
    };
  }

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

  @Get('sede/:sedeId/entregados-hoy')
  @Roles(...ROLES_GESTORES)
  async entregadosHoyDeSede(
    @Param('sedeId', ParseUUIDPipe) sedeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const pedidos = await this.listarEntregadosDeSede.execute(sedeId, user);
    return {
      success: true,
      data: pedidos.map(toPedidoEnSalaResponse),
      message: 'Pedidos entregados de hoy consultados correctamente.',
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
    const tablas = await this.prisma.diningTable.findMany({
      where: { locationId: sedeId },
      select: { id: true, code: true },
      orderBy: { code: 'asc' },
    });
    const participantes = await this.prisma.sharedTableParticipant.findMany({
      where: {
        session: {
          status: { in: ['abierto', 'enviado'] },
          tableId: { in: tablas.map((table) => table.id) },
        },
      },
      select: { userId: true, session: { select: { tableId: true } } },
    });
    const personasPorMesa = new Map<string, Set<string>>();
    for (const participant of participantes) {
      const tableId = participant.session.tableId;
      const people = personasPorMesa.get(tableId) ?? new Set<string>();
      people.add(participant.userId);
      personasPorMesa.set(tableId, people);
    }
    const gruposPorMesa = new Map(
      mesas
        .filter((group) => group.mesa)
        .map((group) => [group.mesa!.id, group]),
    );
    const respuesta = tablas.map((table) => {
      const group = gruposPorMesa.get(table.id) ?? {
        mesa: { id: table.id, codigo: table.code },
        pedidos: [],
        totalPendiente: 0,
      };
      const participantesConectados = personasPorMesa.get(table.id)?.size ?? 0;
      return {
        ...toMesaConPedidosResponse(group),
        participantesConectados,
        ocupacion:
          participantesConectados > 0 ||
          group.pedidos.length > 0 ||
          (group.totalPendiente ?? 0) > 0
            ? 'ocupada'
            : 'disponible',
      };
    });
    const tableIds = new Set(tablas.map((table) => table.id));
    for (const group of mesas.filter(
      (item) => item.mesa && !tableIds.has(item.mesa.id),
    )) {
      respuesta.push({
        ...toMesaConPedidosResponse(group),
        participantesConectados: 0,
        ocupacion:
          group.pedidos.length > 0 || (group.totalPendiente ?? 0) > 0
            ? 'ocupada'
            : 'disponible',
      });
    }
    for (const group of mesas.filter((item) => !item.mesa)) {
      respuesta.push({
        ...toMesaConPedidosResponse(group),
        participantesConectados: 0,
        ocupacion: 'disponible',
      });
    }
    return {
      success: true,
      data: respuesta,
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

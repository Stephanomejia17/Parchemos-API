import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AuthenticatedUser } from '../../src/common/decorators/current-user.decorator';
import { Role } from '../../src/common/enums/role.enum';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { PedidosService } from '../../src/modules/pedidos/application/pedidos.service';
import { CambiarEstadoPedidoUseCase } from '../../src/modules/pedidos/application/use-cases/cambiar-estado-pedido.use-case';
import { ConfirmarPedidoUseCase } from '../../src/modules/pedidos/application/use-cases/confirmar-pedido.use-case';
import { ConsultarEstadoPedidoUseCase } from '../../src/modules/pedidos/application/use-cases/consultar-estado-pedido.use-case';
import { ConsultarHistorialPedidoUseCase } from '../../src/modules/pedidos/application/use-cases/consultar-historial-pedido.use-case';
import { ListarPedidosEnCursoDeSedeUseCase } from '../../src/modules/pedidos/application/use-cases/listar-pedidos-en-curso-de-sede.use-case';
import { ListarPedidosEnSalaUseCase } from '../../src/modules/pedidos/application/use-cases/listar-pedidos-en-sala.use-case';
import { ConsultarResumenSedeUseCase } from '../../src/modules/pedidos/application/use-cases/consultar-resumen-sede.use-case';
import { PedidoAccess } from '../../src/modules/pedidos/application/use-cases/pedido-access';
import type { HistorialEstadoPedido } from '../../src/modules/pedidos/domain/entities/historial-estado-pedido';
import { Pedido } from '../../src/modules/pedidos/domain/entities/pedido.entity';
import type {
  CuentaPendiente,
  ItemPedidoEnSala,
  MesaRef,
  PedidoEnSala,
} from '../../src/modules/pedidos/domain/entities/pedido-en-sala';
import type { ResumenSede } from '../../src/modules/pedidos/domain/entities/resumen-sede';
import { PedidoEstado } from '../../src/modules/pedidos/domain/enums/pedido-estado.enum';
import { PedidoModalidad } from '../../src/modules/pedidos/domain/enums/pedido-modalidad.enum';
import {
  PEDIDO_REPOSITORY,
  type CambioEstadoPedido,
  type PedidoRepository,
} from '../../src/modules/pedidos/domain/repositories/pedido.repository';
import { ESTADOS_FINALES } from '../../src/modules/pedidos/domain/services/pedido-estado-flujo';
import {
  PEDIDO_EVENTOS,
  type EstadoPedidoActualizado,
  type PedidoEventos,
} from '../../src/modules/pedidos/domain/services/pedido-eventos';
import { PedidosController } from '../../src/modules/pedidos/infrastructure/http/pedidos.controller';

/**
 * Infraestructura compartida de las pruebas e2e de pedidos (GP-08, GP-05):
 * la API real de pedidos sobre un repositorio en memoria que imita a la base
 * (incluido el trigger del historial) y un guard que toma el usuario del
 * header `x-test-user`.
 */

export const USUARIOS = {
  comensal: { id: 'comensal-1', role: Role.COMENSAL },
  otroComensal: { id: 'comensal-2', role: Role.COMENSAL },
  personal: { id: 'staff-1', role: Role.PERSONAL_RESTAURANTE },
  personalOtraSede: { id: 'staff-2', role: Role.PERSONAL_RESTAURANTE },
} as const;

export type Usuario = keyof typeof USUARIOS;

export const ID_SEDE = '22222222-2222-4222-8222-222222222222';

export interface PedidoSemilla {
  id: string;
  numero: number;
  estado: PedidoEstado;
  modalidad?: PedidoModalidad;
  total?: number;
  mesa?: MesaRef | null;
  items?: ItemPedidoEnSala[];
  estadoPago?: string;
  pagado?: number;
}

interface Registro {
  pedido: Pedido;
  mesa: MesaRef | null;
  items: ItemPedidoEnSala[];
  estadoPago: string;
  pagado: number;
}

export class InMemoryPedidoRepository implements PedidoRepository {
  private readonly registros = new Map<string, Registro>();
  readonly historial = new Map<string, HistorialEstadoPedido[]>();

  /** Siembra un pedido como lo dejaría POST /pedidos (GP-01) o el carrito. */
  agregarPedido(semilla: PedidoSemilla): void {
    const confirmado = semilla.estado !== PedidoEstado.BORRADOR;
    const pedido = new Pedido({
      id: semilla.id,
      numero: semilla.numero,
      restauranteId: 'rest-1',
      sedeId: ID_SEDE,
      sedeNombre: 'Sede Centro',
      comensalId: USUARIOS.comensal.id,
      modalidad: semilla.modalidad ?? PedidoModalidad.PARA_LLEVAR,
      estado: semilla.estado,
      total: semilla.total ?? 42000,
      confirmadoEn: confirmado ? new Date() : null,
      entregadoEn: null,
    });
    this.registros.set(pedido.id, {
      pedido,
      mesa: semilla.mesa ?? null,
      items: semilla.items ?? [],
      estadoPago: semilla.estadoPago ?? 'pendiente',
      pagado: semilla.pagado ?? 0,
    });
    this.historial.set(pedido.id, [
      {
        desde: null,
        hacia: semilla.estado,
        fecha: new Date(),
        cambiadoPorRol: confirmado ? Role.COMENSAL : null,
        nota: null,
      },
    ]);
  }

  findById(id: string): Promise<Pedido | null> {
    const registro = this.registros.get(id);
    // Copia: el caso de uso muta la entidad antes de guardarla.
    return Promise.resolve(
      registro ? new Pedido({ ...registro.pedido, items: [] }) : null,
    );
  }

  private enCurso(sedeId: string): Registro[] {
    return [...this.registros.values()].filter(
      ({ pedido }) =>
        pedido.sedeId === sedeId &&
        pedido.estado !== PedidoEstado.BORRADOR &&
        !ESTADOS_FINALES.includes(pedido.estado),
    );
  }

  findEnCursoDeSede(sedeId: string): Promise<Pedido[]> {
    return Promise.resolve(this.enCurso(sedeId).map((r) => r.pedido));
  }

  findEnSalaDeSede(sedeId: string): Promise<PedidoEnSala[]> {
    return Promise.resolve(
      this.enCurso(sedeId).map(({ pedido, mesa, items, estadoPago }) => ({
        pedido,
        mesa,
        items,
        estadoPago,
      })),
    );
  }

  resumenDeSede(sedeId: string, desde: Date): Promise<ResumenSede> {
    const deLaSede = [...this.registros.values()].filter(
      (r) => r.pedido.sedeId === sedeId,
    );
    const enCurso = this.enCurso(sedeId);
    const desdeHoy = (fecha: Date | null) => fecha !== null && fecha >= desde;
    return Promise.resolve({
      ordenesHoy: deLaSede.filter(
        (r) =>
          r.pedido.estado !== PedidoEstado.BORRADOR &&
          desdeHoy(r.pedido.confirmadoEn),
      ).length,
      pendientes: enCurso.length,
      entregadasHoy: deLaSede.filter(
        (r) =>
          r.pedido.estado === PedidoEstado.ENTREGADO &&
          desdeHoy(r.pedido.entregadoEn),
      ).length,
      mesasOcupadas: new Set(
        enCurso.flatMap((r) => (r.mesa ? [r.mesa.id] : [])),
      ).size,
      mesasTotales: new Set(
        deLaSede.flatMap((r) => (r.mesa ? [r.mesa.id] : [])),
      ).size,
    });
  }

  findCuentasPendientesDeSede(sedeId: string): Promise<CuentaPendiente[]> {
    return Promise.resolve(
      [...this.registros.values()].flatMap(
        ({ pedido, mesa, estadoPago, pagado }) =>
          mesa &&
          pedido.sedeId === sedeId &&
          pedido.estado !== PedidoEstado.BORRADOR &&
          pedido.estado !== PedidoEstado.CANCELADO &&
          ['pendiente', 'parcial'].includes(estadoPago)
            ? [{ mesa, total: pedido.total, pagado }]
            : [],
      ),
    );
  }

  restauranteDeSede(sedeId: string): Promise<string | null> {
    return Promise.resolve(sedeId === ID_SEDE ? 'rest-1' : null);
  }

  findHistorial(pedidoId: string): Promise<HistorialEstadoPedido[]> {
    return Promise.resolve(this.historial.get(pedidoId) ?? []);
  }

  contarItems(pedidoId: string): Promise<number> {
    return Promise.resolve(this.registros.get(pedidoId)?.items.length || 1);
  }

  esDuenoDelRestaurante(): Promise<boolean> {
    return Promise.resolve(false);
  }

  esPersonalActivoDeSede(sedeId: string, userId: string): Promise<boolean> {
    return Promise.resolve(
      sedeId === ID_SEDE && userId === USUARIOS.personal.id,
    );
  }

  guardarCambioDeEstado({
    estadoAnterior,
    pedido,
    autorId,
    nota,
  }: CambioEstadoPedido): Promise<boolean> {
    const registro = this.registros.get(pedido.id);
    if (!registro || registro.pedido.estado !== estadoAnterior) {
      return Promise.resolve(false);
    }
    registro.pedido = pedido;
    const autor = Object.values(USUARIOS).find((u) => u.id === autorId);
    this.historial.get(pedido.id)?.push({
      desde: estadoAnterior,
      hacia: pedido.estado,
      fecha: new Date(),
      cambiadoPorRol: autor?.role ?? null,
      nota: nota ?? null,
    });
    return Promise.resolve(true);
  }
}

export class EventosRegistrados implements PedidoEventos {
  readonly publicados: EstadoPedidoActualizado[] = [];
  readonly recibidos: Pedido[] = [];

  estadoActualizado(evento: EstadoPedidoActualizado): Promise<void> {
    this.publicados.push(evento);
    return Promise.resolve();
  }

  pedidoRecibido(pedido: Pedido): Promise<void> {
    this.recibidos.push(pedido);
    return Promise.resolve();
  }
}

/** Reemplaza al SupabaseJwtGuard: el usuario llega en el header x-test-user. */
@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const key = req.headers['x-test-user'] as Usuario;
    const usuario = USUARIOS[key];
    if (usuario) {
      req.user = { ...usuario, email: `${key}@test.co`, status: 'activa' };
    }
    return Boolean(usuario);
  }
}

/** Levanta el controlador real de pedidos con sus casos de uso. */
export async function crearAppPedidos(
  repo: InMemoryPedidoRepository,
  eventos: EventosRegistrados,
): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PedidosController],
    providers: [
      PedidoAccess,
      ConfirmarPedidoUseCase,
      ConsultarEstadoPedidoUseCase,
      CambiarEstadoPedidoUseCase,
      ConsultarHistorialPedidoUseCase,
      ListarPedidosEnCursoDeSedeUseCase,
      ListarPedidosEnSalaUseCase,
      ConsultarResumenSedeUseCase,
      { provide: PedidosService, useValue: {} },
      { provide: PEDIDO_REPOSITORY, useValue: repo },
      { provide: PEDIDO_EVENTOS, useValue: eventos },
      { provide: APP_GUARD, useClass: HeaderAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_FILTER, useClass: HttpExceptionFilter },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

/** Peticiones hechas como un usuario de prueba. */
export function como(app: INestApplication<App>, usuario: Usuario) {
  return {
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set('x-test-user', usuario),
    post: (url: string, body: object = {}) =>
      request(app.getHttpServer())
        .post(url)
        .set('x-test-user', usuario)
        .send(body),
    patch: (url: string, body: object) =>
      request(app.getHttpServer())
        .patch(url)
        .set('x-test-user', usuario)
        .send(body),
  };
}

export interface Respuesta<T> {
  data: T;
  code?: string;
}

export const cuerpo = <T>(res: { body: unknown }) => res.body as Respuesta<T>;

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
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { Role } from '../src/common/enums/role.enum';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PedidosService } from '../src/modules/pedidos/application/pedidos.service';
import { CambiarEstadoPedidoUseCase } from '../src/modules/pedidos/application/use-cases/cambiar-estado-pedido.use-case';
import { ConfirmarPedidoUseCase } from '../src/modules/pedidos/application/use-cases/confirmar-pedido.use-case';
import { ConsultarEstadoPedidoUseCase } from '../src/modules/pedidos/application/use-cases/consultar-estado-pedido.use-case';
import { ConsultarHistorialPedidoUseCase } from '../src/modules/pedidos/application/use-cases/consultar-historial-pedido.use-case';
import { ListarPedidosEnCursoDeSedeUseCase } from '../src/modules/pedidos/application/use-cases/listar-pedidos-en-curso-de-sede.use-case';
import { ListarPedidosEnSalaUseCase } from '../src/modules/pedidos/application/use-cases/listar-pedidos-en-sala.use-case';
import { PedidoAccess } from '../src/modules/pedidos/application/use-cases/pedido-access';
import type { HistorialEstadoPedido } from '../src/modules/pedidos/domain/entities/historial-estado-pedido';
import { Pedido } from '../src/modules/pedidos/domain/entities/pedido.entity';
import type { PedidoEnSala } from '../src/modules/pedidos/domain/entities/pedido-en-sala';
import { PedidoEstado } from '../src/modules/pedidos/domain/enums/pedido-estado.enum';
import { PedidoModalidad } from '../src/modules/pedidos/domain/enums/pedido-modalidad.enum';
import {
  PEDIDO_REPOSITORY,
  type CambioEstadoPedido,
  type PedidoRepository,
} from '../src/modules/pedidos/domain/repositories/pedido.repository';
import {
  ESTADO_INICIAL_PEDIDO,
  ESTADOS_FINALES,
} from '../src/modules/pedidos/domain/services/pedido-estado-flujo';
import {
  PEDIDO_EVENTOS,
  type EstadoPedidoActualizado,
  type PedidoEventos,
} from '../src/modules/pedidos/domain/services/pedido-eventos';
import { PedidosController } from '../src/modules/pedidos/infrastructure/http/pedidos.controller';

/**
 * PARCHE-501: recorre por HTTP el flujo completo de GP-08 entre el personal y
 * el comensal (estado inicial -> Listo -> Entregado). La base de datos se
 * reemplaza por un repositorio en memoria que imita el trigger del historial.
 */

const USUARIOS = {
  comensal: { id: 'comensal-1', role: Role.COMENSAL },
  otroComensal: { id: 'comensal-2', role: Role.COMENSAL },
  personal: { id: 'staff-1', role: Role.PERSONAL_RESTAURANTE },
  personalOtraSede: { id: 'staff-2', role: Role.PERSONAL_RESTAURANTE },
} as const;

const ID_PEDIDO = '11111111-1111-4111-8111-111111111111';
const ID_SEDE = '22222222-2222-4222-8222-222222222222';

class InMemoryPedidoRepository implements PedidoRepository {
  readonly pedidos = new Map<string, Pedido>();
  readonly historial = new Map<string, HistorialEstadoPedido[]>();

  /** Lo que hace POST /pedidos (GP-01): el pedido nace en el estado inicial. */
  crearPedidoConfirmado(): void {
    const pedido = new Pedido({
      id: ID_PEDIDO,
      numero: 101,
      restauranteId: 'rest-1',
      sedeId: ID_SEDE,
      sedeNombre: 'Sede Centro',
      comensalId: USUARIOS.comensal.id,
      modalidad: PedidoModalidad.PARA_LLEVAR,
      estado: ESTADO_INICIAL_PEDIDO,
      total: 42000,
      confirmadoEn: new Date(),
      entregadoEn: null,
    });
    this.pedidos.set(pedido.id, pedido);
    this.historial.set(pedido.id, [
      {
        desde: null,
        hacia: ESTADO_INICIAL_PEDIDO,
        fecha: new Date(),
        cambiadoPorRol: Role.COMENSAL,
        nota: null,
      },
    ]);
  }

  findById(id: string): Promise<Pedido | null> {
    const pedido = this.pedidos.get(id);
    // Copia: el caso de uso muta la entidad antes de guardarla.
    return Promise.resolve(
      pedido
        ? new Pedido({ ...pedido, estado: pedido.estado, items: [] })
        : null,
    );
  }

  findEnCursoDeSede(sedeId: string): Promise<Pedido[]> {
    return Promise.resolve(
      [...this.pedidos.values()].filter(
        (p) =>
          p.sedeId === sedeId &&
          p.estado !== PedidoEstado.BORRADOR &&
          !ESTADOS_FINALES.includes(p.estado),
      ),
    );
  }

  async findEnSalaDeSede(sedeId: string): Promise<PedidoEnSala[]> {
    const pedidos = await this.findEnCursoDeSede(sedeId);
    return pedidos.map((pedido) => ({
      pedido,
      mesa: null,
      items: [],
      estadoPago: 'pendiente',
    }));
  }

  restauranteDeSede(sedeId: string): Promise<string | null> {
    return Promise.resolve(sedeId === ID_SEDE ? 'rest-1' : null);
  }

  findHistorial(pedidoId: string): Promise<HistorialEstadoPedido[]> {
    return Promise.resolve(this.historial.get(pedidoId) ?? []);
  }

  contarItems(): Promise<number> {
    return Promise.resolve(1);
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
    const actual = this.pedidos.get(pedido.id);
    if (!actual || actual.estado !== estadoAnterior) {
      return Promise.resolve(false);
    }
    this.pedidos.set(pedido.id, pedido);
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

class EventosRegistrados implements PedidoEventos {
  readonly publicados: EstadoPedidoActualizado[] = [];

  estadoActualizado(evento: EstadoPedidoActualizado): Promise<void> {
    this.publicados.push(evento);
    return Promise.resolve();
  }

  readonly recibidos: Pedido[] = [];

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
    const key = req.headers['x-test-user'] as keyof typeof USUARIOS;
    const usuario = USUARIOS[key];
    if (usuario) {
      req.user = { ...usuario, email: `${key}@test.co`, status: 'activa' };
    }
    return Boolean(usuario);
  }
}

interface Respuesta<T> {
  data: T;
  code?: string;
}

interface EstadoJson {
  id: string;
  estado: string;
  finalizado: boolean;
  sedeNombre: string;
  siguientesEstados: string[];
  entregadoEn: string | null;
}

const cuerpo = <T>(res: { body: unknown }) => res.body as Respuesta<T>;

describe('GP-08 flujo completo de estados del pedido (e2e)', () => {
  let app: INestApplication<App>;
  let repo: InMemoryPedidoRepository;
  let eventos: EventosRegistrados;

  const como = (usuario: keyof typeof USUARIOS) => ({
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set('x-test-user', usuario),
    patch: (url: string, body: object) =>
      request(app.getHttpServer())
        .patch(url)
        .set('x-test-user', usuario)
        .send(body),
  });

  beforeAll(async () => {
    repo = new InMemoryPedidoRepository();
    eventos = new EventosRegistrados();
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
        { provide: PedidosService, useValue: {} },
        { provide: PEDIDO_REPOSITORY, useValue: repo },
        { provide: PEDIDO_EVENTOS, useValue: eventos },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    repo.crearPedidoConfirmado();
  });

  afterAll(async () => {
    await app.close();
  });

  const url = `/pedidos/${ID_PEDIDO}`;

  it('CA1-CA2: el comensal ve su pedido recién creado en el estado inicial', async () => {
    const res = await como('comensal').get(`${url}/estado`).expect(200);
    expect(cuerpo<EstadoJson>(res).data).toMatchObject({
      estado: 'pendiente',
      finalizado: false,
      sedeNombre: 'Sede Centro',
    });
    expect(cuerpo<EstadoJson>(res).data.siguientesEstados).toContain('listo');
  });

  it('otro comensal no puede ver el pedido', async () => {
    await como('otroComensal').get(`${url}/estado`).expect(404);
  });

  it('el personal de la sede lo ve en su panel de pedidos en curso', async () => {
    const res = await como('personal')
      .get(`/pedidos/sede/${ID_SEDE}`)
      .expect(200);
    expect(cuerpo<EstadoJson[]>(res).data.map((p) => p.id)).toEqual([
      ID_PEDIDO,
    ]);
  });

  it('el comensal no puede cambiar el estado (403) y el personal de otra sede tampoco (404)', async () => {
    await como('comensal')
      .patch(`${url}/estado`, { estado: 'listo' })
      .expect(403);
    await como('personalOtraSede')
      .patch(`${url}/estado`, { estado: 'listo' })
      .expect(404);
    expect(eventos.publicados).toHaveLength(0);
  });

  it('CA3 + CA5: el personal lo marca como Listo y se le avisa al comensal', async () => {
    const res = await como('personal')
      .patch(`${url}/estado`, { estado: 'listo', nota: 'Ventanilla 2' })
      .expect(200);
    expect(cuerpo<EstadoJson>(res).data.estado).toBe('listo');

    expect(eventos.publicados).toHaveLength(1);
    expect(eventos.publicados[0]).toMatchObject({
      estadoAnterior: 'pendiente',
      autorId: USUARIOS.personal.id,
    });
    expect(eventos.publicados[0].pedido.comensalId).toBe(USUARIOS.comensal.id);

    const vista = await como('comensal').get(`${url}/estado`).expect(200);
    expect(cuerpo<EstadoJson>(vista).data.estado).toBe('listo');
  });

  it('no permite retroceder un pedido listo', async () => {
    const res = await como('personal')
      .patch(`${url}/estado`, { estado: 'en_preparacion' })
      .expect(409);
    expect(cuerpo<unknown>(res).code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('rechaza estados que no se gestionan desde este endpoint', async () => {
    await como('personal')
      .patch(`${url}/estado`, { estado: 'cancelado' })
      .expect(400);
  });

  it('CA4: el personal lo marca como Entregado y queda constancia de la finalización', async () => {
    const res = await como('personal')
      .patch(`${url}/estado`, { estado: 'entregado' })
      .expect(200);
    expect(cuerpo<EstadoJson>(res).data).toMatchObject({
      estado: 'entregado',
      finalizado: true,
      siguientesEstados: [],
    });
    expect(cuerpo<EstadoJson>(res).data.entregadoEn).toEqual(
      expect.any(String),
    );

    const panel = await como('personal')
      .get(`/pedidos/sede/${ID_SEDE}`)
      .expect(200);
    expect(cuerpo<EstadoJson[]>(panel).data).toEqual([]);

    await como('personal')
      .patch(`${url}/estado`, { estado: 'listo' })
      .expect(409);
  });

  it('CA6: el historial conserva cada cambio con su autor, en orden', async () => {
    const res = await como('comensal').get(`${url}/historial`).expect(200);
    expect(
      cuerpo<HistorialEstadoPedido[]>(res).data.map((h) => [
        h.desde,
        h.hacia,
        h.cambiadoPorRol,
        h.nota,
      ]),
    ).toEqual([
      [null, 'pendiente', 'comensal', null],
      ['pendiente', 'listo', 'personal_restaurante', 'Ventanilla 2'],
      ['listo', 'entregado', 'personal_restaurante', null],
    ]);
  });
});

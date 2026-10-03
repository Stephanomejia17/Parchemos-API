import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import type { HistorialEstadoPedido } from '../src/modules/pedidos/domain/entities/historial-estado-pedido';
import { ESTADO_INICIAL_PEDIDO } from '../src/modules/pedidos/domain/services/pedido-estado-flujo';
import {
  EventosRegistrados,
  ID_SEDE,
  InMemoryPedidoRepository,
  USUARIOS,
  como,
  crearAppPedidos,
  cuerpo,
} from './support/pedidos-e2e';

/**
 * PARCHE-501: recorre por HTTP el flujo completo de GP-08 entre el personal y
 * el comensal (estado inicial -> Listo -> Entregado). La base de datos se
 * reemplaza por un repositorio en memoria que imita el trigger del historial.
 */

const ID_PEDIDO = '11111111-1111-4111-8111-111111111111';

interface EstadoJson {
  id: string;
  estado: string;
  finalizado: boolean;
  sedeNombre: string;
  siguientesEstados: string[];
  entregadoEn: string | null;
}

describe('GP-08 flujo completo de estados del pedido (e2e)', () => {
  let app: INestApplication<App>;
  let eventos: EventosRegistrados;

  beforeAll(async () => {
    const repo = new InMemoryPedidoRepository();
    eventos = new EventosRegistrados();
    app = await crearAppPedidos(repo, eventos);
    // Lo que hace POST /pedidos (GP-01): el pedido nace en el estado inicial.
    repo.agregarPedido({
      id: ID_PEDIDO,
      numero: 101,
      estado: ESTADO_INICIAL_PEDIDO,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const url = `/pedidos/${ID_PEDIDO}`;

  it('CA1-CA2: el comensal ve su pedido recién creado en el estado inicial', async () => {
    const res = await como(app, 'comensal').get(`${url}/estado`).expect(200);
    expect(cuerpo<EstadoJson>(res).data).toMatchObject({
      estado: 'pendiente',
      finalizado: false,
      sedeNombre: 'Sede Centro',
    });
    expect(cuerpo<EstadoJson>(res).data.siguientesEstados).toContain('listo');
  });

  it('otro comensal no puede ver el pedido', async () => {
    await como(app, 'otroComensal').get(`${url}/estado`).expect(404);
  });

  it('el personal de la sede lo ve en su panel de pedidos en curso', async () => {
    const res = await como(app, 'personal')
      .get(`/pedidos/sede/${ID_SEDE}`)
      .expect(200);
    expect(cuerpo<EstadoJson[]>(res).data.map((p) => p.id)).toEqual([
      ID_PEDIDO,
    ]);
  });

  it('el comensal no puede cambiar el estado (403) y el personal de otra sede tampoco (404)', async () => {
    await como(app, 'comensal')
      .patch(`${url}/estado`, { estado: 'listo' })
      .expect(403);
    await como(app, 'personalOtraSede')
      .patch(`${url}/estado`, { estado: 'listo' })
      .expect(404);
    expect(eventos.publicados).toHaveLength(0);
  });

  it('CA3 + CA5: el personal lo marca como Listo y se le avisa al comensal', async () => {
    const res = await como(app, 'personal')
      .patch(`${url}/estado`, { estado: 'listo', nota: 'Ventanilla 2' })
      .expect(200);
    expect(cuerpo<EstadoJson>(res).data.estado).toBe('listo');

    expect(eventos.publicados).toHaveLength(1);
    expect(eventos.publicados[0]).toMatchObject({
      estadoAnterior: 'pendiente',
      autorId: USUARIOS.personal.id,
    });
    expect(eventos.publicados[0].pedido.comensalId).toBe(USUARIOS.comensal.id);

    const vista = await como(app, 'comensal').get(`${url}/estado`).expect(200);
    expect(cuerpo<EstadoJson>(vista).data.estado).toBe('listo');
  });

  it('no permite retroceder un pedido listo', async () => {
    const res = await como(app, 'personal')
      .patch(`${url}/estado`, { estado: 'en_preparacion' })
      .expect(409);
    expect(cuerpo<unknown>(res).code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('rechaza estados que no se gestionan desde este endpoint', async () => {
    await como(app, 'personal')
      .patch(`${url}/estado`, { estado: 'cancelado' })
      .expect(400);
  });

  it('CA4: el personal lo marca como Entregado y queda constancia de la finalización', async () => {
    const res = await como(app, 'personal')
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

    const panel = await como(app, 'personal')
      .get(`/pedidos/sede/${ID_SEDE}`)
      .expect(200);
    expect(cuerpo<EstadoJson[]>(panel).data).toEqual([]);

    await como(app, 'personal')
      .patch(`${url}/estado`, { estado: 'listo' })
      .expect(409);
  });

  it('CA6: el historial conserva cada cambio con su autor, en orden', async () => {
    const res = await como(app, 'comensal').get(`${url}/historial`).expect(200);
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

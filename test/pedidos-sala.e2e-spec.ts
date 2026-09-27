import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { PedidoEstado } from '../src/modules/pedidos/domain/enums/pedido-estado.enum';
import { PedidoModalidad } from '../src/modules/pedidos/domain/enums/pedido-modalidad.enum';
import {
  EventosRegistrados,
  ID_SEDE,
  InMemoryPedidoRepository,
  como,
  crearAppPedidos,
  cuerpo,
} from './support/pedidos-e2e';

/**
 * PARCHE-498: un pedido confirmado aparece en el panel del personal de la
 * sede, con su detalle y el saldo de la mesa, y se gestiona hasta Entregado.
 */

const ID_PEDIDO = '33333333-3333-4333-8333-333333333333';
const ID_PEDIDO_ANTERIOR = '44444444-4444-4444-8444-444444444444';
const MESA_4 = { id: 'mesa-4', codigo: 'Mesa 4' };

interface PedidoSalaJson {
  id: string;
  numero: number;
  estado: string;
  modalidad: string;
  mesa: { id: string; codigo: string } | null;
  items: { nombre: string; cantidad: number; notas: string | null }[];
}

interface MesaJson {
  mesa: { id: string; codigo: string } | null;
  totalPendiente: number | null;
  pedidos: PedidoSalaJson[];
}

describe('GP-05 recibir y gestionar pedidos en sala (e2e)', () => {
  let app: INestApplication<App>;
  let eventos: EventosRegistrados;

  const panel = async () => {
    const res = await como(app, 'personal')
      .get(`/pedidos/sede/${ID_SEDE}/mesas`)
      .expect(200);
    return cuerpo<MesaJson[]>(res).data;
  };

  const cambiar = (estado: string) =>
    como(app, 'personal')
      .patch(`/pedidos/${ID_PEDIDO}/estado`, { estado })
      .expect(200);

  beforeAll(async () => {
    const repo = new InMemoryPedidoRepository();
    eventos = new EventosRegistrados();
    app = await crearAppPedidos(repo, eventos);

    // Pedido anterior de la misma mesa: ya entregado, pagado en parte.
    repo.agregarPedido({
      id: ID_PEDIDO_ANTERIOR,
      numero: 200,
      estado: PedidoEstado.ENTREGADO,
      modalidad: PedidoModalidad.EN_MESA,
      mesa: MESA_4,
      total: 30000,
      estadoPago: 'parcial',
      pagado: 10000,
    });
    // Carrito del comensal en la Mesa 4, todavía sin confirmar.
    repo.agregarPedido({
      id: ID_PEDIDO,
      numero: 201,
      estado: PedidoEstado.BORRADOR,
      modalidad: PedidoModalidad.EN_MESA,
      mesa: MESA_4,
      total: 42000,
      items: [
        {
          nombre: 'Bandeja paisa',
          cantidad: 2,
          precioUnitario: 21000,
          subtotal: 42000,
          notas: 'Sin chicharrón',
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('antes de confirmar, la mesa solo muestra el saldo de lo ya entregado', async () => {
    expect(await panel()).toEqual([
      { mesa: MESA_4, totalPendiente: 20000, pedidos: [] },
    ]);
  });

  it('CA1: al confirmar, el pedido se publica a la sede y aparece en el panel', async () => {
    await como(app, 'comensal')
      .post(`/pedidos/${ID_PEDIDO}/confirmar`)
      .expect(200);

    expect(eventos.recibidos.map((p) => p.id)).toEqual([ID_PEDIDO]);
    expect(eventos.recibidos[0].sedeId).toBe(ID_SEDE);

    const mesas = await panel();
    expect(mesas).toHaveLength(1);
    expect(mesas[0].pedidos.map((p) => p.id)).toEqual([ID_PEDIDO]);
  });

  it('CA2: el detalle trae productos, cantidades, modalidad y mesa', async () => {
    const [pedido] = (await panel())[0].pedidos;
    expect(pedido).toMatchObject({
      numero: 201,
      estado: 'pendiente',
      modalidad: 'en_mesa',
      mesa: MESA_4,
      items: [
        { nombre: 'Bandeja paisa', cantidad: 2, notas: 'Sin chicharrón' },
      ],
    });
  });

  it('CA3: la mesa suma lo pendiente del pedido nuevo y del anterior', async () => {
    expect((await panel())[0].totalPendiente).toBe(62000);
  });

  it('solo el personal de la sede ve el panel', async () => {
    await como(app, 'personalOtraSede')
      .get(`/pedidos/sede/${ID_SEDE}/mesas`)
      .expect(404);
    await como(app, 'comensal')
      .get(`/pedidos/sede/${ID_SEDE}/mesas`)
      .expect(403);
  });

  it('CA4 + CA6: el personal lo gestiona y el comensal ve cada cambio', async () => {
    for (const estado of ['confirmado', 'en_preparacion', 'listo']) {
      await cambiar(estado);
      const res = await como(app, 'comensal')
        .get(`/pedidos/${ID_PEDIDO}/estado`)
        .expect(200);
      expect(cuerpo<{ estado: string }>(res).data.estado).toBe(estado);
    }
    expect(eventos.publicados.map((e) => e.pedido.estado)).toEqual([
      'confirmado',
      'en_preparacion',
      'listo',
    ]);
  });

  it('CA5: al entregarlo sale del panel, pero la mesa conserva su saldo', async () => {
    await cambiar('entregado');

    expect(await panel()).toEqual([
      { mesa: MESA_4, totalPendiente: 62000, pedidos: [] },
    ]);
  });

  it('los indicadores del panel salen de los pedidos reales de la sede', async () => {
    const res = await como(app, 'personal')
      .get(`/pedidos/sede/${ID_SEDE}/resumen`)
      .expect(200);

    expect(cuerpo(res).data).toEqual({
      ordenesHoy: 2,
      pendientes: 0,
      entregadasHoy: 1,
      mesasOcupadas: 0,
      mesasTotales: 1,
    });

    await como(app, 'personalOtraSede')
      .get(`/pedidos/sede/${ID_SEDE}/resumen`)
      .expect(404);
  });
});

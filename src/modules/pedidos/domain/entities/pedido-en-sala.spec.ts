import { makePedido } from '../../application/use-cases/pedido.test-helpers';
import { PedidoEnSala, agruparPorMesa, saldoPendiente } from './pedido-en-sala';

function enSala(id: string, mesa: string | null): PedidoEnSala {
  return {
    pedido: makePedido({ id }),
    mesa: mesa ? { id: `mesa-${mesa}`, codigo: mesa } : null,
    items: [],
    estadoPago: 'pendiente',
  };
}

describe('agruparPorMesa', () => {
  it('agrupa por mesa en orden natural y deja al final los pedidos sin mesa', () => {
    const grupos = agruparPorMesa([
      enSala('p1', 'Mesa 10'),
      enSala('p2', null),
      enSala('p3', 'Mesa 2'),
      enSala('p4', 'Mesa 10'),
    ]);

    expect(grupos.map((g) => g.mesa?.codigo ?? 'sin mesa')).toEqual([
      'Mesa 2',
      'Mesa 10',
      'sin mesa',
    ]);
    expect(grupos[1].pedidos.map((p) => p.pedido.id)).toEqual(['p1', 'p4']);
  });

  it('sin pedidos no hay grupos', () => {
    expect(agruparPorMesa([])).toEqual([]);
  });

  it('CA3: suma el saldo de cada mesa descontando lo ya pagado', () => {
    const mesa2 = { id: 'mesa-Mesa 2', codigo: 'Mesa 2' };
    const grupos = agruparPorMesa(
      [enSala('p1', 'Mesa 2'), enSala('p2', null)],
      [
        { mesa: mesa2, total: 42000, pagado: 0 },
        { mesa: mesa2, total: 30000, pagado: 10000 },
      ],
    );

    expect(grupos.map((g) => g.totalPendiente)).toEqual([62000, null]);
  });

  it('CA3: una mesa con saldo pero sin pedidos en curso también aparece', () => {
    const grupos = agruparPorMesa(
      [],
      [{ mesa: { id: 'm7', codigo: 'Mesa 7' }, total: 25000, pagado: 0 }],
    );

    expect(grupos).toEqual([
      {
        mesa: { id: 'm7', codigo: 'Mesa 7' },
        pedidos: [],
        totalPendiente: 25000,
      },
    ]);
  });
});

describe('saldoPendiente', () => {
  it('no devuelve saldos negativos si se pagó de más', () => {
    expect(
      saldoPendiente({
        mesa: { id: 'm', codigo: 'M' },
        total: 1000,
        pagado: 1500,
      }),
    ).toBe(0);
  });

  it('evita errores de redondeo con decimales', () => {
    expect(
      saldoPendiente({
        mesa: { id: 'm', codigo: 'M' },
        total: 0.3,
        pagado: 0.1,
      }),
    ).toBe(0.2);
  });
});

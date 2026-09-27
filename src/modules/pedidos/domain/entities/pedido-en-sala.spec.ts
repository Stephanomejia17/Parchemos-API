import { makePedido } from '../../application/use-cases/pedido.test-helpers';
import { PedidoEnSala, agruparPorMesa } from './pedido-en-sala';

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
});

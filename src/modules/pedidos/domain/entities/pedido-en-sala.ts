import { Pedido } from './pedido.entity';

export interface MesaRef {
  id: string;
  codigo: string;
}

export interface ItemPedidoEnSala {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  notas: string | null;
}

/** GP-05 CA2: lo que el personal necesita ver de un pedido para atenderlo. */
export interface PedidoEnSala {
  pedido: Pedido;
  mesa: MesaRef | null;
  items: ItemPedidoEnSala[];
  estadoPago: string;
}

export interface MesaConPedidos {
  /** null agrupa los pedidos sin mesa (para llevar o domicilio). */
  mesa: MesaRef | null;
  pedidos: PedidoEnSala[];
}

/**
 * Agrupa los pedidos por mesa: mesas en orden de código (natural, "Mesa 2"
 * antes que "Mesa 10") y al final los pedidos sin mesa. Dentro de cada
 * grupo se respeta el orden recibido (del más antiguo al más reciente).
 */
export function agruparPorMesa(pedidos: PedidoEnSala[]): MesaConPedidos[] {
  const grupos = new Map<string, MesaConPedidos>();
  for (const pedido of pedidos) {
    const clave = pedido.mesa?.id ?? '';
    const grupo = grupos.get(clave) ?? { mesa: pedido.mesa, pedidos: [] };
    grupo.pedidos.push(pedido);
    grupos.set(clave, grupo);
  }
  return [...grupos.values()].sort((a, b) => {
    if (!a.mesa) return 1;
    if (!b.mesa) return -1;
    return a.mesa.codigo.localeCompare(b.mesa.codigo, 'es', { numeric: true });
  });
}

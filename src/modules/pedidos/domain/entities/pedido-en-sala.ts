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

/** Pedido de una mesa que todavía no está pagado del todo. */
export interface CuentaPendiente {
  mesa: MesaRef;
  total: number;
  pagado: number;
}

export interface MesaConPedidos {
  /** null agrupa los pedidos sin mesa (para llevar o domicilio). */
  mesa: MesaRef | null;
  pedidos: PedidoEnSala[];
  /** GP-05 CA3: lo que falta pagar en la mesa; null para el grupo sin mesa. */
  totalPendiente: number | null;
}

/** Saldo de un pedido: nunca negativo aunque se haya pagado de más. */
export function saldoPendiente({ total, pagado }: CuentaPendiente): number {
  return Math.max(0, Math.round((total - pagado) * 100) / 100);
}

/**
 * Agrupa los pedidos por mesa: mesas en orden de código (natural, "Mesa 2"
 * antes que "Mesa 10") y al final los pedidos sin mesa. Dentro de cada
 * grupo se respeta el orden recibido (del más antiguo al más reciente).
 *
 * Cada mesa suma el saldo de sus cuentas pendientes, incluidas las de
 * pedidos ya entregados; una mesa con saldo pero sin pedidos en curso
 * también aparece, para poder cobrarla.
 */
export function agruparPorMesa(
  pedidos: PedidoEnSala[],
  cuentas: CuentaPendiente[] = [],
): MesaConPedidos[] {
  const grupos = new Map<string, MesaConPedidos>();
  const grupoDe = (mesa: MesaRef | null) => {
    const clave = mesa?.id ?? '';
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { mesa, pedidos: [], totalPendiente: mesa ? 0 : null };
      grupos.set(clave, grupo);
    }
    return grupo;
  };

  for (const pedido of pedidos) grupoDe(pedido.mesa).pedidos.push(pedido);
  for (const cuenta of cuentas) {
    const grupo = grupoDe(cuenta.mesa);
    grupo.totalPendiente =
      Math.round(((grupo.totalPendiente ?? 0) + saldoPendiente(cuenta)) * 100) /
      100;
  }

  return [...grupos.values()].sort((a, b) => {
    if (!a.mesa) return 1;
    if (!b.mesa) return -1;
    return a.mesa.codigo.localeCompare(b.mesa.codigo, 'es', { numeric: true });
  });
}

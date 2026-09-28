import type {
  OrderFulfillment,
  OrderStatus,
} from '../../../../../generated/prisma/client';
import { Pedido } from '../../domain/entities/pedido.entity';
import type { PedidoEnSala } from '../../domain/entities/pedido-en-sala';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
import { PedidoModalidad } from '../../domain/enums/pedido-modalidad.enum';

export interface PedidoPersistenceRow {
  id: string;
  orderNumber: bigint;
  restaurantId: string;
  locationId: string;
  location: { name: string };
  dinerId: string | null;
  fulfillment: OrderFulfillment;
  status: OrderStatus;
  total: { toNumber(): number };
  placedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PEDIDO_SELECT = {
  id: true,
  orderNumber: true,
  restaurantId: true,
  locationId: true,
  location: { select: { name: true } },
  dinerId: true,
  fulfillment: true,
  status: true,
  total: true,
  placedAt: true,
  deliveredAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function toPedidoDomain(row: PedidoPersistenceRow): Pedido {
  return new Pedido({
    id: row.id,
    numero: Number(row.orderNumber),
    restauranteId: row.restaurantId,
    sedeId: row.locationId,
    sedeNombre: row.location.name,
    comensalId: row.dinerId,
    modalidad: row.fulfillment as PedidoModalidad,
    estado: row.status as PedidoEstado,
    total: row.total.toNumber(),
    confirmadoEn: row.placedAt,
    entregadoEn: row.deliveredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export const PEDIDO_EN_SALA_SELECT = {
  ...PEDIDO_SELECT,
  paymentStatus: true,
  table: { select: { id: true, code: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      productName: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      notes: true,
    },
  },
} as const;

export interface PedidoEnSalaPersistenceRow extends PedidoPersistenceRow {
  paymentStatus: string;
  table: { id: string; code: string } | null;
  items: {
    productName: string;
    quantity: number;
    unitPrice: { toNumber(): number };
    lineTotal: { toNumber(): number };
    notes: string | null;
  }[];
}

export function toPedidoEnSala(row: PedidoEnSalaPersistenceRow): PedidoEnSala {
  return {
    pedido: toPedidoDomain(row),
    mesa: row.table ? { id: row.table.id, codigo: row.table.code } : null,
    estadoPago: row.paymentStatus,
    items: row.items.map((item) => ({
      nombre: item.productName,
      cantidad: item.quantity,
      precioUnitario: item.unitPrice.toNumber(),
      subtotal: item.lineTotal.toNumber(),
      notas: item.notes,
    })),
  };
}

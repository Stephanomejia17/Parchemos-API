import type {
  OrderFulfillment,
  OrderStatus,
} from '../../../../../generated/prisma/client';
import { Pedido } from '../../domain/entities/pedido.entity';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
import { PedidoModalidad } from '../../domain/enums/pedido-modalidad.enum';

export interface PedidoPersistenceRow {
  id: string;
  orderNumber: bigint;
  restaurantId: string;
  locationId: string;
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

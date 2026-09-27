/** GP-08: ciclo de vida del pedido. Refleja el enum `order_status` de la base. */
export enum PedidoEstado {
  BORRADOR = 'borrador',
  PENDIENTE = 'pendiente',
  CONFIRMADO = 'confirmado',
  EN_PREPARACION = 'en_preparacion',
  LISTO = 'listo',
  EN_CAMINO = 'en_camino',
  ENTREGADO = 'entregado',
  CANCELADO = 'cancelado',
}

import { BaseEntity } from '../../../../common/domain/base.entity';
import { PedidoEstado } from '../enums/pedido-estado.enum';

export class PedidoItem {
  constructor(
    public readonly productoId: string,
    public cantidad: number,
    public precioUnitario: number,
  ) {}
}

export class Pedido extends BaseEntity {
  constructor(
    id: string,
    public comensalId: string,
    public restauranteId: string,
    public items: PedidoItem[],
    public estado: PedidoEstado = PedidoEstado.PENDIENTE,
    public repartidorId?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(id, createdAt, updatedAt);
  }

  get total(): number {
    return this.items.reduce((acc, item) => acc + item.cantidad * item.precioUnitario, 0);
  }
}

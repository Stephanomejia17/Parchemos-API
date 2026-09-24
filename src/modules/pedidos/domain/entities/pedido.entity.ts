import { BaseEntity } from '../../../../common/domain/base.entity';
import { PedidoEstado } from '../enums/pedido-estado.enum';
import { PedidoModalidad } from '../enums/pedido-modalidad.enum';
import { TransicionEstadoInvalidaError } from '../errors/transicion-estado-invalida.error';
import {
  ESTADO_INICIAL_PEDIDO,
  esTransicionValida,
} from '../services/pedido-estado-flujo';

export class PedidoItem {
  constructor(
    public readonly productoId: string,
    public cantidad: number,
    public precioUnitario: number,
  ) {}
}

export interface PedidoProps {
  id: string;
  numero: number;
  restauranteId: string;
  sedeId: string;
  /** Nombre de la sede, para mostrarlo al comensal. */
  sedeNombre?: string;
  comensalId: string | null;
  modalidad: PedidoModalidad;
  estado: PedidoEstado;
  total: number;
  confirmadoEn: Date | null;
  entregadoEn: Date | null;
  items?: PedidoItem[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class Pedido extends BaseEntity {
  readonly numero: number;
  readonly restauranteId: string;
  readonly sedeId: string;
  readonly sedeNombre: string;
  readonly comensalId: string | null;
  readonly modalidad: PedidoModalidad;
  estado: PedidoEstado;
  total: number;
  confirmadoEn: Date | null;
  entregadoEn: Date | null;
  items: PedidoItem[];

  constructor(props: PedidoProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.numero = props.numero;
    this.restauranteId = props.restauranteId;
    this.sedeId = props.sedeId;
    this.sedeNombre = props.sedeNombre ?? '';
    this.comensalId = props.comensalId;
    this.modalidad = props.modalidad;
    this.estado = props.estado;
    this.total = props.total;
    this.confirmadoEn = props.confirmadoEn;
    this.entregadoEn = props.entregadoEn;
    this.items = props.items ?? [];
  }

  perteneceAComensal(userId: string): boolean {
    return this.comensalId !== null && this.comensalId === userId;
  }

  /** GP-08 CA1: el comensal confirma su carrito y el pedido entra al flujo. */
  confirmar(fecha: Date): void {
    if (this.estado !== PedidoEstado.BORRADOR) {
      throw new TransicionEstadoInvalidaError(
        this.estado,
        ESTADO_INICIAL_PEDIDO,
      );
    }
    this.estado = ESTADO_INICIAL_PEDIDO;
    this.confirmadoEn = fecha;
    this.updatedAt = fecha;
  }

  /** Cambio de estado hecho por el restaurante (GP-08 CA3, CA4). */
  cambiarEstado(destino: PedidoEstado, fecha: Date): void {
    if (!esTransicionValida(this.estado, destino, this.modalidad)) {
      throw new TransicionEstadoInvalidaError(this.estado, destino);
    }
    this.estado = destino;
    this.updatedAt = fecha;
  }
}

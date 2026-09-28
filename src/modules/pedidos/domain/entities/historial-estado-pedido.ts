import { Role } from '../../../../common/enums/role.enum';
import { PedidoEstado } from '../enums/pedido-estado.enum';

/** GP-08 CA6: una transicion registrada en order_status_history. */
export interface HistorialEstadoPedido {
  desde: PedidoEstado | null;
  hacia: PedidoEstado;
  fecha: Date;
  /** Rol de quien hizo el cambio; null si lo hizo el sistema. */
  cambiadoPorRol: Role | null;
  nota: string | null;
}

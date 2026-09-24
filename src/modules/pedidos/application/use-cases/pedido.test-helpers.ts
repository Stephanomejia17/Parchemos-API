import { Pedido, PedidoProps } from '../../domain/entities/pedido.entity';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
import { PedidoModalidad } from '../../domain/enums/pedido-modalidad.enum';

export function makePedido(overrides: Partial<PedidoProps> = {}): Pedido {
  return new Pedido({
    id: 'pedido-1',
    numero: 1,
    restauranteId: 'rest-1',
    sedeId: 'sede-1',
    comensalId: 'comensal-1',
    modalidad: PedidoModalidad.EN_MESA,
    estado: PedidoEstado.PENDIENTE,
    total: 42000,
    confirmadoEn: new Date('2026-09-23T12:00:00Z'),
    entregadoEn: null,
    ...overrides,
  });
}

import { Pedido, PedidoProps } from '../../domain/entities/pedido.entity';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
import { PedidoModalidad } from '../../domain/enums/pedido-modalidad.enum';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';

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

export type PedidoRepositoryMocks = Record<keyof PedidoRepository, jest.Mock>;

/** Repositorio falso: por defecto nadie tiene acceso y todo se guarda. */
export function mockPedidoRepository(
  overrides: Partial<PedidoRepositoryMocks> = {},
): { mocks: PedidoRepositoryMocks; repo: PedidoRepository } {
  const mocks: PedidoRepositoryMocks = {
    findById: jest.fn().mockResolvedValue(makePedido()),
    findConfirmadosDeComensal: jest.fn().mockResolvedValue([]),
    findHistorial: jest.fn().mockResolvedValue([]),
    contarItems: jest.fn().mockResolvedValue(1),
    esDuenoDelRestaurante: jest.fn().mockResolvedValue(false),
    esPersonalActivoDeSede: jest.fn().mockResolvedValue(false),
    guardarCambioDeEstado: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
  return { mocks, repo: mocks };
}

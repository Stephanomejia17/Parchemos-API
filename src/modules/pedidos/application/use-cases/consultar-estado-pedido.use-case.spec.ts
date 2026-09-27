import { Role } from '../../../../common/enums/role.enum';
import { ConsultarEstadoPedidoUseCase } from './consultar-estado-pedido.use-case';
import { PedidoAccess } from './pedido-access';
import {
  mockPedidoRepository,
  PedidoRepositoryMocks,
} from './pedido.test-helpers';

function setup(overrides: Partial<PedidoRepositoryMocks> = {}) {
  const { mocks, repo } = mockPedidoRepository(overrides);
  const useCase = new ConsultarEstadoPedidoUseCase(new PedidoAccess(repo));
  return { mocks, useCase };
}

describe('ConsultarEstadoPedidoUseCase', () => {
  it('el comensal dueño del pedido ve su estado actual', async () => {
    const { useCase } = setup();
    const pedido = await useCase.execute('pedido-1', {
      id: 'comensal-1',
      role: Role.COMENSAL,
    });
    expect(pedido.estado).toBe('pendiente');
  });

  it('otro comensal recibe "no existe"', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute('pedido-1', { id: 'otro', role: Role.COMENSAL }),
    ).rejects.toThrow('El pedido no existe.');
  });

  it('el personal activo de la sede ve el pedido', async () => {
    const { mocks, useCase } = setup({
      esPersonalActivoDeSede: jest.fn().mockResolvedValue(true),
    });
    await useCase.execute('pedido-1', {
      id: 'staff-1',
      role: Role.PERSONAL_RESTAURANTE,
    });
    expect(mocks.esPersonalActivoDeSede).toHaveBeenCalledWith(
      'sede-1',
      'staff-1',
    );
  });

  it('el personal de otra sede no ve el pedido', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute('pedido-1', {
        id: 'staff-2',
        role: Role.PERSONAL_RESTAURANTE,
      }),
    ).rejects.toThrow('El pedido no existe.');
  });

  it('el dueño del restaurante ve el pedido', async () => {
    const { mocks, useCase } = setup({
      esDuenoDelRestaurante: jest.fn().mockResolvedValue(true),
    });
    await useCase.execute('pedido-1', {
      id: 'dueno-1',
      role: Role.RESTAURANTE,
    });
    expect(mocks.esDuenoDelRestaurante).toHaveBeenCalledWith(
      'rest-1',
      'dueno-1',
    );
  });

  it('responde 404 si el pedido no existe', async () => {
    const { useCase } = setup({ findById: jest.fn().mockResolvedValue(null) });
    await expect(
      useCase.execute('nope', { id: 'admin', role: Role.ADMINISTRADOR }),
    ).rejects.toThrow('El pedido no existe.');
  });
});

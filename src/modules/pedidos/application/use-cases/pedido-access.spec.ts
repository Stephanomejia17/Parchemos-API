import { Role } from '../../../../common/enums/role.enum';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
import { CambiarEstadoPedidoUseCase } from './cambiar-estado-pedido.use-case';
import { PedidoAccess } from './pedido-access';
import {
  mockPedidoRepository,
  PedidoRepositoryMocks,
} from './pedido.test-helpers';

function setup(overrides: Partial<PedidoRepositoryMocks> = {}) {
  const { mocks, repo } = mockPedidoRepository(overrides);
  const eventos = { estadoActualizado: jest.fn().mockResolvedValue(undefined) };
  const useCase = new CambiarEstadoPedidoUseCase(
    new PedidoAccess(repo),
    repo,
    eventos,
  );
  return { mocks, useCase };
}

const aListo = { estado: PedidoEstado.LISTO };

describe('Restricción de cambios de estado al personal autorizado', () => {
  it('el personal activo de la sede puede cambiar el estado', async () => {
    const { mocks, useCase } = setup({
      esPersonalActivoDeSede: jest.fn().mockResolvedValue(true),
    });
    await useCase.execute(
      'pedido-1',
      { id: 'staff-1', role: Role.PERSONAL_RESTAURANTE },
      aListo,
    );
    expect(mocks.guardarCambioDeEstado).toHaveBeenCalled();
  });

  it('el dueño del restaurante puede cambiar el estado', async () => {
    const { mocks, useCase } = setup({
      esDuenoDelRestaurante: jest.fn().mockResolvedValue(true),
    });
    await useCase.execute(
      'pedido-1',
      { id: 'dueno-1', role: Role.RESTAURANTE },
      aListo,
    );
    expect(mocks.guardarCambioDeEstado).toHaveBeenCalled();
  });

  it('el personal de otra sede recibe "no existe" y no cambia nada', async () => {
    const { mocks, useCase } = setup();
    await expect(
      useCase.execute(
        'pedido-1',
        { id: 'staff-2', role: Role.PERSONAL_RESTAURANTE },
        aListo,
      ),
    ).rejects.toThrow('El pedido no existe.');
    expect(mocks.guardarCambioDeEstado).not.toHaveBeenCalled();
  });

  it('el dueño de otro restaurante recibe "no existe"', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute(
        'pedido-1',
        { id: 'dueno-2', role: Role.RESTAURANTE },
        aListo,
      ),
    ).rejects.toThrow('El pedido no existe.');
  });

  it('el comensal ve su pedido, pero no puede cambiarle el estado', async () => {
    const { mocks, useCase } = setup();
    await expect(
      useCase.execute(
        'pedido-1',
        { id: 'comensal-1', role: Role.COMENSAL },
        aListo,
      ),
    ).rejects.toThrow(
      'Solo el personal del restaurante puede actualizar el estado del pedido.',
    );
    expect(mocks.guardarCambioDeEstado).not.toHaveBeenCalled();
  });

  it('un repartidor no puede cambiar el estado de un pedido en sala', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute(
        'pedido-1',
        { id: 'rep-1', role: Role.REPARTIDOR },
        aListo,
      ),
    ).rejects.toThrow('El pedido no existe.');
  });
});

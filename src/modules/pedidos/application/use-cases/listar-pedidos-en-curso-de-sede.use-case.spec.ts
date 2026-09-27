import { Role } from '../../../../common/enums/role.enum';
import { ListarPedidosEnCursoDeSedeUseCase } from './listar-pedidos-en-curso-de-sede.use-case';
import { PedidoAccess } from './pedido-access';
import {
  makePedido,
  mockPedidoRepository,
  PedidoRepositoryMocks,
} from './pedido.test-helpers';

function setup(overrides: Partial<PedidoRepositoryMocks> = {}) {
  const { mocks, repo } = mockPedidoRepository({
    findEnCursoDeSede: jest.fn().mockResolvedValue([makePedido()]),
    ...overrides,
  });
  const useCase = new ListarPedidosEnCursoDeSedeUseCase(
    new PedidoAccess(repo),
    repo,
  );
  return { mocks, useCase };
}

describe('ListarPedidosEnCursoDeSedeUseCase', () => {
  it('el personal activo de la sede ve sus pedidos en curso', async () => {
    const { mocks, useCase } = setup({
      esPersonalActivoDeSede: jest.fn().mockResolvedValue(true),
    });
    const pedidos = await useCase.execute('sede-1', {
      id: 'staff-1',
      role: Role.PERSONAL_RESTAURANTE,
    });
    expect(pedidos).toHaveLength(1);
    expect(mocks.findEnCursoDeSede).toHaveBeenCalledWith('sede-1');
  });

  it('el dueño del restaurante ve los pedidos de sus sedes', async () => {
    const { mocks, useCase } = setup({
      esDuenoDelRestaurante: jest.fn().mockResolvedValue(true),
    });
    await useCase.execute('sede-1', { id: 'dueno-1', role: Role.RESTAURANTE });
    expect(mocks.esDuenoDelRestaurante).toHaveBeenCalledWith(
      'rest-1',
      'dueno-1',
    );
  });

  it('el personal de otra sede recibe "no existe"', async () => {
    const { mocks, useCase } = setup();
    await expect(
      useCase.execute('sede-1', {
        id: 'staff-2',
        role: Role.PERSONAL_RESTAURANTE,
      }),
    ).rejects.toThrow('La sede no existe.');
    expect(mocks.findEnCursoDeSede).not.toHaveBeenCalled();
  });

  it('un comensal no puede ver el panel de la sede', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute('sede-1', { id: 'comensal-1', role: Role.COMENSAL }),
    ).rejects.toThrow('La sede no existe.');
  });

  it('responde "no existe" si la sede no existe', async () => {
    const { useCase } = setup({
      restauranteDeSede: jest.fn().mockResolvedValue(null),
    });
    await expect(
      useCase.execute('nope', { id: 'admin', role: Role.ADMINISTRADOR }),
    ).rejects.toThrow('La sede no existe.');
  });
});

import { Role } from '../../../../common/enums/role.enum';
import { ListarPedidosEnSalaUseCase } from './listar-pedidos-en-sala.use-case';
import { PedidoAccess } from './pedido-access';
import {
  makePedido,
  mockPedidoRepository,
  PedidoRepositoryMocks,
} from './pedido.test-helpers';

const mesa = { id: 'mesa-1', codigo: 'Mesa 1' };

function setup(overrides: Partial<PedidoRepositoryMocks> = {}) {
  const { mocks, repo } = mockPedidoRepository({
    findEnSalaDeSede: jest
      .fn()
      .mockResolvedValue([
        { pedido: makePedido(), mesa, items: [], estadoPago: 'pendiente' },
      ]),
    findCuentasPendientesDeSede: jest
      .fn()
      .mockResolvedValue([{ mesa, total: 42000, pagado: 0 }]),
    ...overrides,
  });
  const useCase = new ListarPedidosEnSalaUseCase(new PedidoAccess(repo), repo);
  return { mocks, useCase };
}

describe('ListarPedidosEnSalaUseCase (acceso restringido)', () => {
  it('el personal activo de la sede ve las mesas con su total pendiente', async () => {
    const { useCase } = setup({
      esPersonalActivoDeSede: jest.fn().mockResolvedValue(true),
    });

    const mesas = await useCase.execute('sede-1', {
      id: 'staff-1',
      role: Role.PERSONAL_RESTAURANTE,
    });

    expect(mesas).toHaveLength(1);
    expect(mesas[0]).toMatchObject({ mesa, totalPendiente: 42000 });
  });

  it('el dueño del restaurante ve las mesas de sus sedes', async () => {
    const { useCase } = setup({
      esDuenoDelRestaurante: jest.fn().mockResolvedValue(true),
    });

    await expect(
      useCase.execute('sede-1', { id: 'dueno-1', role: Role.RESTAURANTE }),
    ).resolves.toHaveLength(1);
  });

  it.each([
    ['personal de otra sede', Role.PERSONAL_RESTAURANTE],
    ['dueño de otro restaurante', Role.RESTAURANTE],
    ['comensal', Role.COMENSAL],
    ['repartidor', Role.REPARTIDOR],
  ])('%s recibe "no existe" y no se consulta nada', async (_, role) => {
    const { mocks, useCase } = setup();

    await expect(
      useCase.execute('sede-1', { id: 'otro', role }),
    ).rejects.toThrow('La sede no existe.');
    expect(mocks.findEnSalaDeSede).not.toHaveBeenCalled();
    expect(mocks.findCuentasPendientesDeSede).not.toHaveBeenCalled();
  });
});

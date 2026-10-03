import { Role } from '../../../../common/enums/role.enum';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
import { ConsultarHistorialPedidoUseCase } from './consultar-historial-pedido.use-case';
import { PedidoAccess } from './pedido-access';
import { mockPedidoRepository } from './pedido.test-helpers';

describe('ConsultarHistorialPedidoUseCase', () => {
  it('devuelve el historial al comensal dueño del pedido', async () => {
    const historial = [
      {
        desde: null,
        hacia: PedidoEstado.BORRADOR,
        fecha: new Date(),
        cambiadoPorRol: null,
        nota: null,
      },
      {
        desde: PedidoEstado.BORRADOR,
        hacia: PedidoEstado.PENDIENTE,
        fecha: new Date(),
        cambiadoPorRol: Role.COMENSAL,
        nota: null,
      },
    ];
    const { repo } = mockPedidoRepository({
      findHistorial: jest.fn().mockResolvedValue(historial),
    });
    const useCase = new ConsultarHistorialPedidoUseCase(
      new PedidoAccess(repo),
      repo,
    );

    await expect(
      useCase.execute('pedido-1', { id: 'comensal-1', role: Role.COMENSAL }),
    ).resolves.toEqual(historial);
  });

  it('no revela el historial a quien no puede ver el pedido', async () => {
    const { mocks, repo } = mockPedidoRepository();
    const useCase = new ConsultarHistorialPedidoUseCase(
      new PedidoAccess(repo),
      repo,
    );

    await expect(
      useCase.execute('pedido-1', { id: 'otro', role: Role.COMENSAL }),
    ).rejects.toThrow('El pedido no existe.');
    expect(mocks.findHistorial).not.toHaveBeenCalled();
  });
});

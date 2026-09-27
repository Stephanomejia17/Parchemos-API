import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
import { ConfirmarPedidoUseCase } from './confirmar-pedido.use-case';
import {
  makePedido,
  mockPedidoRepository,
  PedidoRepositoryMocks,
} from './pedido.test-helpers';

function setup(overrides: Partial<PedidoRepositoryMocks> = {}) {
  const { mocks, repo } = mockPedidoRepository({
    findById: jest
      .fn()
      .mockResolvedValue(
        makePedido({ estado: PedidoEstado.BORRADOR, confirmadoEn: null }),
      ),
    ...overrides,
  });
  return { mocks, useCase: new ConfirmarPedidoUseCase(repo) };
}

describe('ConfirmarPedidoUseCase', () => {
  it('asigna el estado inicial y la fecha de confirmación', async () => {
    const { mocks, useCase } = setup();
    const pedido = await useCase.execute('pedido-1', 'comensal-1');

    expect(pedido.estado).toBe(PedidoEstado.PENDIENTE);
    expect(pedido.confirmadoEn).toBeInstanceOf(Date);
    expect(mocks.guardarCambioDeEstado).toHaveBeenCalledWith({
      estadoAnterior: PedidoEstado.BORRADOR,
      pedido,
      autorId: 'comensal-1',
    });
  });

  it('rechaza confirmar el pedido de otro comensal', async () => {
    const { mocks, useCase } = setup();
    await expect(useCase.execute('pedido-1', 'otro')).rejects.toThrow(
      'Este pedido no te pertenece.',
    );
    expect(mocks.guardarCambioDeEstado).not.toHaveBeenCalled();
  });

  it('rechaza confirmar un pedido sin productos', async () => {
    const { useCase } = setup({ contarItems: jest.fn().mockResolvedValue(0) });
    await expect(useCase.execute('pedido-1', 'comensal-1')).rejects.toThrow(
      'Agrega al menos un producto antes de confirmar el pedido.',
    );
  });

  it('rechaza confirmar un pedido que ya salió de borrador', async () => {
    const { useCase } = setup({
      findById: jest.fn().mockResolvedValue(makePedido()),
    });
    await expect(useCase.execute('pedido-1', 'comensal-1')).rejects.toThrow(
      'El pedido no puede pasar de "pendiente" a "pendiente".',
    );
  });

  it('avisa si otro cambio se adelantó al guardar', async () => {
    const { useCase } = setup({
      guardarCambioDeEstado: jest.fn().mockResolvedValue(false),
    });
    await expect(useCase.execute('pedido-1', 'comensal-1')).rejects.toThrow(
      'El pedido cambió mientras lo confirmabas.',
    );
  });
});

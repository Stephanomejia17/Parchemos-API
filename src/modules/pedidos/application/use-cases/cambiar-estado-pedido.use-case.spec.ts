import { Role } from '../../../../common/enums/role.enum';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
import { CambiarEstadoPedidoUseCase } from './cambiar-estado-pedido.use-case';
import { PedidoAccess } from './pedido-access';
import {
  makePedido,
  mockPedidoRepository,
  PedidoRepositoryMocks,
} from './pedido.test-helpers';

const personal = { id: 'staff-1', role: Role.PERSONAL_RESTAURANTE };

function setup(overrides: Partial<PedidoRepositoryMocks> = {}) {
  const { mocks, repo } = mockPedidoRepository({
    esPersonalActivoDeSede: jest.fn().mockResolvedValue(true),
    ...overrides,
  });
  const useCase = new CambiarEstadoPedidoUseCase(new PedidoAccess(repo), repo);
  return { mocks, useCase };
}

describe('CambiarEstadoPedidoUseCase', () => {
  it('marca como listo un pedido en preparación', async () => {
    const { mocks, useCase } = setup({
      findById: jest
        .fn()
        .mockResolvedValue(makePedido({ estado: PedidoEstado.EN_PREPARACION })),
    });

    const pedido = await useCase.execute('pedido-1', personal, {
      estado: PedidoEstado.LISTO,
    });

    expect(pedido.estado).toBe(PedidoEstado.LISTO);
    expect(mocks.guardarCambioDeEstado).toHaveBeenCalledWith({
      estadoAnterior: PedidoEstado.EN_PREPARACION,
      pedido,
    });
  });

  it('rechaza una transición que retrocede el pedido', async () => {
    const { mocks, useCase } = setup({
      findById: jest
        .fn()
        .mockResolvedValue(makePedido({ estado: PedidoEstado.LISTO })),
    });

    await expect(
      useCase.execute('pedido-1', personal, {
        estado: PedidoEstado.EN_PREPARACION,
      }),
    ).rejects.toThrow(
      'El pedido no puede pasar de "listo" a "en_preparacion".',
    );
    expect(mocks.guardarCambioDeEstado).not.toHaveBeenCalled();
  });

  it('no permite mover un pedido que sigue en borrador', async () => {
    const { useCase } = setup({
      findById: jest
        .fn()
        .mockResolvedValue(makePedido({ estado: PedidoEstado.BORRADOR })),
    });

    await expect(
      useCase.execute('pedido-1', personal, { estado: PedidoEstado.LISTO }),
    ).rejects.toThrow('El pedido no puede pasar de "borrador" a "listo".');
  });

  it('avisa si otro usuario cambió el pedido primero', async () => {
    const { useCase } = setup({
      guardarCambioDeEstado: jest.fn().mockResolvedValue(false),
    });

    await expect(
      useCase.execute('pedido-1', personal, { estado: PedidoEstado.LISTO }),
    ).rejects.toThrow('Otro usuario actualizó este pedido.');
  });

  it('al entregar un pedido listo registra la fecha de finalización', async () => {
    const { useCase } = setup({
      findById: jest
        .fn()
        .mockResolvedValue(makePedido({ estado: PedidoEstado.LISTO })),
    });

    const pedido = await useCase.execute('pedido-1', personal, {
      estado: PedidoEstado.ENTREGADO,
    });

    expect(pedido.estado).toBe(PedidoEstado.ENTREGADO);
    expect(pedido.entregadoEn).toBeInstanceOf(Date);
    expect(pedido.estaFinalizado()).toBe(true);
  });

  it('no permite entregar un pedido que aún no está listo', async () => {
    const { useCase } = setup({
      findById: jest
        .fn()
        .mockResolvedValue(makePedido({ estado: PedidoEstado.EN_PREPARACION })),
    });

    await expect(
      useCase.execute('pedido-1', personal, { estado: PedidoEstado.ENTREGADO }),
    ).rejects.toThrow(
      'El pedido no puede pasar de "en_preparacion" a "entregado".',
    );
  });

  it('un pedido entregado ya no admite cambios', async () => {
    const { useCase } = setup({
      findById: jest.fn().mockResolvedValue(
        makePedido({
          estado: PedidoEstado.ENTREGADO,
          entregadoEn: new Date('2026-09-23T13:00:00Z'),
        }),
      ),
    });

    await expect(
      useCase.execute('pedido-1', personal, { estado: PedidoEstado.LISTO }),
    ).rejects.toThrow('El pedido no puede pasar de "entregado" a "listo".');
  });
});

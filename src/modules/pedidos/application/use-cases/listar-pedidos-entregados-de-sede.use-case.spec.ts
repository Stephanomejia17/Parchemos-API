import { Role } from '../../../../common/enums/role.enum';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';
import { PedidoAccess } from './pedido-access';
import { ListarPedidosEntregadosDeSedeUseCase } from './listar-pedidos-entregados-de-sede.use-case';

describe('ListarPedidosEntregadosDeSedeUseCase', () => {
  it('limita el historial al día en Bogotá y valida acceso a la sede', async () => {
    const repository = {
      restauranteDeSede: jest.fn().mockResolvedValue('restaurant-1'),
      esPersonalActivoDeSede: jest.fn().mockResolvedValue(true),
      findEntregadosDeSede: jest.fn().mockResolvedValue([]),
    };
    const useCase = new ListarPedidosEntregadosDeSedeUseCase(
      new PedidoAccess(repository as unknown as PedidoRepository),
      repository as unknown as PedidoRepository,
    );

    await useCase.execute(
      'location-1',
      { id: 'staff-1', role: Role.PERSONAL_RESTAURANTE },
      new Date('2026-10-25T02:30:00.000Z'),
    );

    expect(repository.esPersonalActivoDeSede).toHaveBeenCalledWith(
      'location-1',
      'staff-1',
    );
    expect(repository.findEntregadosDeSede).toHaveBeenCalledWith(
      'location-1',
      new Date('2026-10-24T05:00:00.000Z'),
    );
  });
});

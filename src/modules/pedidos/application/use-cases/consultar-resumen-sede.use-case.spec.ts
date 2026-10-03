import { Role } from '../../../../common/enums/role.enum';
import { inicioDelDiaEnBogota } from '../../domain/entities/resumen-sede';
import { ConsultarResumenSedeUseCase } from './consultar-resumen-sede.use-case';
import { PedidoAccess } from './pedido-access';
import {
  mockPedidoRepository,
  PedidoRepositoryMocks,
} from './pedido.test-helpers';

function setup(overrides: Partial<PedidoRepositoryMocks> = {}) {
  const { mocks, repo } = mockPedidoRepository(overrides);
  const useCase = new ConsultarResumenSedeUseCase(new PedidoAccess(repo), repo);
  return { mocks, useCase };
}

describe('inicioDelDiaEnBogota', () => {
  it('a las 10 p. m. de Bogotá (03:00 UTC del día siguiente) sigue siendo el mismo día', () => {
    expect(
      inicioDelDiaEnBogota(new Date('2026-09-28T03:00:00Z')).toISOString(),
    ).toBe('2026-09-27T05:00:00.000Z');
  });

  it('a las 8 a. m. de Bogotá el día empieza a las 05:00 UTC', () => {
    expect(
      inicioDelDiaEnBogota(new Date('2026-09-27T13:00:00Z')).toISOString(),
    ).toBe('2026-09-27T05:00:00.000Z');
  });
});

describe('ConsultarResumenSedeUseCase', () => {
  it('cuenta desde la medianoche de Bogotá para el personal de la sede', async () => {
    const { mocks, useCase } = setup({
      esPersonalActivoDeSede: jest.fn().mockResolvedValue(true),
    });

    await useCase.execute(
      'sede-1',
      { id: 'staff-1', role: Role.PERSONAL_RESTAURANTE },
      new Date('2026-09-27T20:00:00Z'),
    );

    expect(mocks.resumenDeSede).toHaveBeenCalledWith(
      'sede-1',
      new Date('2026-09-27T05:00:00Z'),
    );
  });

  it('el personal de otra sede no ve el resumen', async () => {
    const { mocks, useCase } = setup();

    await expect(
      useCase.execute('sede-1', {
        id: 'staff-2',
        role: Role.PERSONAL_RESTAURANTE,
      }),
    ).rejects.toThrow('La sede no existe.');
    expect(mocks.resumenDeSede).not.toHaveBeenCalled();
  });
});

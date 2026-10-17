import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PreferenciasService } from './preferencias.service';

function setup(validCuisines = 2) {
  const prisma = {
    cuisineType: { count: jest.fn().mockResolvedValue(validCuisines) },
    userCuisinePreference: {
      deleteMany: jest.fn().mockReturnValue('delete'),
      createMany: jest.fn().mockReturnValue('create'),
    },
    userPreference: { upsert: jest.fn().mockReturnValue('upsert') },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const service = new PreferenciasService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('PreferenciasService.save', () => {
  it('reemplaza las cocinas y el rango de precio en una transaccion', async () => {
    const { service, prisma } = setup();

    await service.save('user-1', {
      cuisineIds: ['a', 'b', 'a'],
      priceRangeMin: 1,
      priceRangeMax: 3,
    });

    expect(prisma.userCuisinePreference.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', cuisineTypeId: 'a' },
        { userId: 'user-1', cuisineTypeId: 'b' },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      'delete',
      'create',
      'upsert',
    ]);
  });

  it('rechaza un rango incompleto o invertido antes de tocar la BD', async () => {
    const { service, prisma } = setup();

    await expect(
      service.save('user-1', {
        cuisineIds: [],
        priceRangeMin: 2,
        priceRangeMax: null,
      }),
    ).rejects.toThrow('ninguno de los dos');
    await expect(
      service.save('user-1', {
        cuisineIds: [],
        priceRangeMin: 4,
        priceRangeMax: 1,
      }),
    ).rejects.toThrow('no puede ser mayor');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza tipos de cocina inexistentes o inactivos', async () => {
    const { service, prisma } = setup(1);

    await expect(
      service.save('user-1', {
        cuisineIds: ['a', 'b'],
        priceRangeMin: null,
        priceRangeMax: null,
      }),
    ).rejects.toThrow('Algún tipo de cocina no es válido.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

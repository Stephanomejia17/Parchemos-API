import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

@Injectable()
export class ListPublicLocationMenuUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(locationId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, status: 'activa' },
      select: { id: true, restaurantId: true },
    });
    if (!location) return null;

    const products = await this.prisma.product.findMany({
      where: { restaurantId: location.restaurantId },
      include: { availability: { where: { locationId } } },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    });

    return products.map((product) => {
      const locationAvailability = product.availability[0];
      const available =
        product.status === 'activo' &&
        (locationAvailability?.isAvailable ?? true);
      return {
        id: product.id,
        restaurantId: product.restaurantId,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        category: product.category,
        price:
          locationAvailability?.priceOverride?.toNumber() ??
          product.price.toNumber(),
        status: available ? product.status : 'inactivo',
        featured: product.featured,
      };
    });
  }
}

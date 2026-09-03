import { ProductCategory, ProductStatus } from '../../../../../generated/prisma/client';

export class Producto {
  constructor(
    public readonly id: string,
    public readonly restaurantId: string,
    public readonly name: string,
    public readonly description: string | null,
    public readonly imageUrl: string | null,
    public readonly category: ProductCategory,
    public readonly price: number,
    public readonly status: ProductStatus,
    public readonly featured: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}

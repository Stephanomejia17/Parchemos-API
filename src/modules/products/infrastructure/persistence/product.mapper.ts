import { ProductCategory as PrismaProductCategory, ProductStatus as PrismaProductStatus } from '../../../../../generated/prisma/client';
import { Producto } from '../../domain/entities/product.entity';
import { ProductCategory } from '../../domain/enums/product-category.enum';
import { ProductStatus } from '../../domain/enums/product-status.enum';

export interface ProductPersistenceRow {
  id: string; restaurantId: string; name: string; description: string | null; imageUrl: string | null;
  category: PrismaProductCategory; price: { toNumber(): number }; status: PrismaProductStatus;
  featured: boolean; createdAt: Date; updatedAt: Date;
}

export function toProductDomain(row: ProductPersistenceRow): Producto {
  return new Producto(row.id, row.restaurantId, row.name, row.description, row.imageUrl,
    row.category as ProductCategory, row.price.toNumber(), row.status as ProductStatus,
    row.featured, row.createdAt, row.updatedAt);
}

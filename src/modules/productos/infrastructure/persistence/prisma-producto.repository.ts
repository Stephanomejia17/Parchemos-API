import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { ProductCategory, ProductStatus } from '../../../../../generated/prisma/client';
import {
  CreateProductData,
  ProductFilters,
  ProductPage,
  ProductoRepository,
  UpdateProductData,
} from '../../domain/repositories/producto.repository';
import { Producto } from '../../domain/entities/producto.entity';

@Injectable()
export class PrismaProductoRepository implements ProductoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async restaurantExists(restaurantId: string): Promise<boolean> {
    return Boolean(await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } }));
  }

  async restaurantBelongsToUser(restaurantId: string, userId: string): Promise<boolean> {
    return Boolean(await this.prisma.restaurant.findFirst({ where: { id: restaurantId, ownerId: userId }, select: { id: true } }));
  }

  async findById(id: string): Promise<Producto | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findPage(restaurantId: string, filters: ProductFilters): Promise<ProductPage> {
    const where = {
      restaurantId,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.featured === undefined ? {} : { featured: filters.featured }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], skip: filters.skip, take: filters.take }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map(toDomain), total };
  }

  async create(data: CreateProductData): Promise<Producto> {
    const row = await this.prisma.product.create({
      data: {
        restaurantId: data.restaurantId,
        name: data.name,
        description: data.description ?? null,
        category: data.category,
        price: data.price,
        status: data.status,
        featured: data.featured ?? false,
      },
    });
    return toDomain(row);
  }

  async update(id: string, data: UpdateProductData): Promise<Producto> {
    const row = await this.prisma.product.update({ where: { id }, data });
    return toDomain(row);
  }

  async setFeatured(id: string, featured: boolean): Promise<Producto> {
    const row = await this.prisma.product.update({ where: { id }, data: { featured } });
    return toDomain(row);
  }

  async setImage(id: string, imageUrl: string): Promise<Producto> {
    const row = await this.prisma.product.update({ where: { id }, data: { imageUrl } });
    return toDomain(row);
  }
}

function toDomain(row: {
  id: string; restaurantId: string; name: string; description: string | null; imageUrl: string | null;
  category: ProductCategory; price: { toNumber(): number }; status: ProductStatus;
  featured: boolean; createdAt: Date; updatedAt: Date;
}): Producto {
  return new Producto(row.id, row.restaurantId, row.name, row.description, row.imageUrl, row.category, row.price.toNumber(), row.status, row.featured, row.createdAt, row.updatedAt);
}

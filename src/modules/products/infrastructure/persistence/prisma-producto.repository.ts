import { Injectable } from '@nestjs/common';
import { ProductCategory, ProductStatus } from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { ProductNameAlreadyExistsError } from '../../domain/errors/product-name-already-exists.error';
import { CreateProductData, ProductFilters, ProductPage, ProductoRepository, UpdateProductData } from '../../domain/repositories/producto.repository';
import { Producto } from '../../domain/entities/product.entity';
import { toProductDomain } from './product.mapper';

@Injectable()
export class PrismaProductoRepository implements ProductoRepository {
  constructor(private readonly prisma: PrismaService) {}
  async restaurantExists(restaurantId: string) { return Boolean(await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } })); }
  async restaurantBelongsToUser(restaurantId: string, userId: string) { return Boolean(await this.prisma.restaurant.findFirst({ where: { id: restaurantId, ownerId: userId }, select: { id: true } })); }
  async findById(id: string): Promise<Producto | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? toProductDomain(row) : null;
  }
  async findPage(restaurantId: string, filters: ProductFilters): Promise<ProductPage> {
    const where = { restaurantId, ...(filters.category ? { category: filters.category as ProductCategory } : {}), ...(filters.status ? { status: filters.status as ProductStatus } : {}), ...(filters.featured === undefined ? {} : { featured: filters.featured }) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], skip: filters.skip, take: filters.take }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map(toProductDomain), total };
  }
  async create(data: CreateProductData): Promise<Producto> {
    try {
      const row = await this.prisma.product.create({ data: { restaurantId: data.restaurantId, name: data.name, description: data.description ?? null, category: data.category as ProductCategory, price: data.price, status: data.status as ProductStatus, featured: data.featured ?? false } });
      return toProductDomain(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ProductNameAlreadyExistsError();
      throw error;
    }
  }
  async update(id: string, data: UpdateProductData): Promise<Producto> {
    try {
      const row = await this.prisma.product.update({ where: { id }, data: { ...data, category: data.category as ProductCategory, status: data.status as ProductStatus } });
      return toProductDomain(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ProductNameAlreadyExistsError();
      throw error;
    }
  }
  async setFeatured(id: string, featured: boolean) { return toProductDomain(await this.prisma.product.update({ where: { id }, data: { featured } })); }
  async setImage(id: string, imageUrl: string) { return toProductDomain(await this.prisma.product.update({ where: { id }, data: { imageUrl } })); }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === 'P2002' || (error as { code?: string })?.code === '23505';
}

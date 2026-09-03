import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../../common/enums/role.enum';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { ProductStatus } from '../../../../generated/prisma/client';
import { SupabaseStorageService } from '../../../infrastructure/storage/supabase-storage.service';
import { PRODUCTO_REPOSITORY } from '../domain/repositories/producto.repository';
import type { CreateProductData, ProductFilters, ProductoRepository, UpdateProductData } from '../domain/repositories/producto.repository';

@Injectable()
export class ProductosService {
  constructor(
    @Inject(PRODUCTO_REPOSITORY) private readonly products: ProductoRepository,
    private readonly storage: SupabaseStorageService,
  ) {}

  async create(restaurantId: string, user: AuthenticatedUser, data: Omit<CreateProductData, 'restaurantId'>) {
    await this.assertAccess(restaurantId, user);
    try {
      return await this.products.create({ ...data, restaurantId, name: data.name.trim(), description: data.description?.trim() || null });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Ya existe un producto con ese nombre en este restaurante.');
      throw error;
    }
  }

  async list(restaurantId: string, user: AuthenticatedUser, filters: ProductFilters) {
    await this.assertAccess(restaurantId, user);
    return this.products.findPage(restaurantId, filters);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('El producto no existe.');
    await this.assertAccess(product.restaurantId, user);
    return product;
  }

  async update(id: string, user: AuthenticatedUser, data: UpdateProductData) {
    await this.findOne(id, user);
    try {
      return await this.products.update(id, {
        ...data,
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined ? { description: typeof data.description === 'string' ? data.description.trim() || null : null } : {}),
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Ya existe un producto con ese nombre en este restaurante.');
      throw error;
    }
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user);
    return this.products.update(id, { status: ProductStatus.inactivo });
  }

  async setFeatured(id: string, user: AuthenticatedUser, featured: boolean) {
    await this.findOne(id, user);
    return this.products.setFeatured(id, featured);
  }

  async uploadImage(id: string, user: AuthenticatedUser, file: { buffer: Buffer; mimetype: string; size: number }) {
    const product = await this.findOne(id, user);
    const uploaded = await this.storage.uploadImage(file, `products/${id}`);
    const updated = await this.products.setImage(id, uploaded.publicUrl);
    const previousPath = product.imageUrl ? this.storage.pathFromPublicUrl(product.imageUrl) : null;
    if (previousPath) await this.storage.remove(previousPath);
    return updated;
  }

  private async assertAccess(restaurantId: string, user: AuthenticatedUser): Promise<void> {
    if (!(await this.products.restaurantExists(restaurantId))) throw new NotFoundException('El restaurante no existe.');
    if (user.role === Role.ADMINISTRADOR) return;
    if (user.role !== Role.RESTAURANTE || !(await this.products.restaurantBelongsToUser(restaurantId, user.id))) {
      throw new ForbiddenException('No tienes permisos para gestionar productos de este restaurante.');
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'P2002' || code === '23505';
}

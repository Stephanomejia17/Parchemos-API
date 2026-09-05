import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { Role } from '../../../../common/enums/role.enum';
import { ProductStatus } from '../../domain/enums/product-status.enum';
import { PRODUCTO_REPOSITORY } from '../../domain/repositories/producto.repository';
import type { CreateProductData, ProductFilters, ProductoRepository, UpdateProductData } from '../../domain/repositories/producto.repository';
import { PRODUCT_IMAGE_STORAGE } from '../../domain/services/product-image-storage';
import type { ProductImageFile, ProductImageStorage } from '../../domain/services/product-image-storage';
import { ProductAccess } from './product-access';
import { CreateProductCommand, UpdateProductCommand } from '../dto/product.commands';

@Injectable()
export class CreateProductUseCase {
  constructor(private readonly access: ProductAccess, @Inject(PRODUCTO_REPOSITORY) private readonly products: ProductoRepository) {}
  async execute(restaurantId: string, userId: string, role: Role, command: CreateProductCommand) {
    await this.access.assertRestaurantAccess(restaurantId, userId, role);
    const data: CreateProductData = { ...command, restaurantId, name: command.name.trim(), description: command.description?.trim() || null };
    return this.products.create(data);
  }
}

@Injectable()
export class ListProductsUseCase {
  constructor(private readonly access: ProductAccess, @Inject(PRODUCTO_REPOSITORY) private readonly products: ProductoRepository) {}
  async execute(restaurantId: string, userId: string, role: Role, filters: ProductFilters) {
    await this.access.assertRestaurantAccess(restaurantId, userId, role);
    return this.products.findPage(restaurantId, filters);
  }
}

@Injectable()
export class GetProductUseCase {
  constructor(private readonly access: ProductAccess, @Inject(PRODUCTO_REPOSITORY) private readonly products: ProductoRepository) {}
  async execute(id: string, userId: string, role: Role) {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundError('El producto no existe.', 'PRODUCT_NOT_FOUND');
    await this.access.assertRestaurantAccess(product.restaurantId, userId, role);
    return product;
  }
}

@Injectable()
export class UpdateProductUseCase {
  constructor(private readonly getProduct: GetProductUseCase, @Inject(PRODUCTO_REPOSITORY) private readonly products: ProductoRepository) {}
  async execute(id: string, userId: string, role: Role, command: UpdateProductCommand) {
    await this.getProduct.execute(id, userId, role);
    const changes: UpdateProductData = {};
    if (command.name !== undefined) changes.name = command.name.trim();
    if (command.description !== undefined) changes.description = command.description == null ? null : command.description.trim() || null;
    if (command.category !== undefined) changes.category = command.category;
    if (command.price !== undefined) changes.price = command.price;
    if (command.status !== undefined) changes.status = command.status;
    return this.products.update(id, changes);
  }
}

@Injectable()
export class DeactivateProductUseCase {
  constructor(private readonly getProduct: GetProductUseCase, @Inject(PRODUCTO_REPOSITORY) private readonly products: ProductoRepository) {}
  async execute(id: string, userId: string, role: Role) { await this.getProduct.execute(id, userId, role); return this.products.update(id, { status: ProductStatus.INACTIVO }); }
}

@Injectable()
export class SetProductFeaturedUseCase {
  constructor(private readonly getProduct: GetProductUseCase, @Inject(PRODUCTO_REPOSITORY) private readonly products: ProductoRepository) {}
  async execute(id: string, userId: string, role: Role, featured: boolean) { await this.getProduct.execute(id, userId, role); return this.products.setFeatured(id, featured); }
}

@Injectable()
export class UploadProductImageUseCase {
  constructor(private readonly getProduct: GetProductUseCase, @Inject(PRODUCTO_REPOSITORY) private readonly products: ProductoRepository, @Inject(PRODUCT_IMAGE_STORAGE) private readonly storage: ProductImageStorage) {}
  async execute(id: string, userId: string, role: Role, file: ProductImageFile) {
    const product = await this.getProduct.execute(id, userId, role);
    const uploaded = await this.storage.uploadImage(file, `products/${id}`);
    let updated;
    try {
      updated = await this.products.setImage(id, uploaded.publicUrl);
    } catch (error) {
      await this.storage.remove(uploaded.path);
      throw error;
    }
    const previousPath = product.imageUrl ? this.storage.pathFromPublicUrl(product.imageUrl) : null;
    if (previousPath) await this.storage.remove(previousPath);
    return updated;
  }
}

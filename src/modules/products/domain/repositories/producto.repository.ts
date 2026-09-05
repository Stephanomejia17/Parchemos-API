import { Producto } from '../entities/product.entity';
import { ProductCategory } from '../enums/product-category.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { CreateProductCommand, ListProductsQuery, UpdateProductCommand } from '../../application/dto/product.commands';

export const PRODUCTO_REPOSITORY = Symbol('PRODUCTO_REPOSITORY');

export type ProductFilters = ListProductsQuery;

export interface ProductPage {
  items: Producto[];
  total: number;
}

export interface CreateProductData extends CreateProductCommand {
  restaurantId: string;
  featured?: boolean;
}

export type UpdateProductData = UpdateProductCommand;

export interface ProductoRepository {
  restaurantExists(restaurantId: string): Promise<boolean>;
  restaurantBelongsToUser(restaurantId: string, userId: string): Promise<boolean>;
  findById(id: string): Promise<Producto | null>;
  findPage(restaurantId: string, filters: ProductFilters): Promise<ProductPage>;
  create(data: CreateProductData): Promise<Producto>;
  update(id: string, data: UpdateProductData): Promise<Producto>;
  setFeatured(id: string, featured: boolean): Promise<Producto>;
  setImage(id: string, imageUrl: string): Promise<Producto>;
}

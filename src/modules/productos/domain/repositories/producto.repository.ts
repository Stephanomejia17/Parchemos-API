import { ProductCategory, ProductStatus } from '../../../../../generated/prisma/client';
import { Producto } from '../entities/producto.entity';

export const PRODUCTO_REPOSITORY = Symbol('PRODUCTO_REPOSITORY');

export interface ProductFilters {
  category?: ProductCategory;
  status?: ProductStatus;
  featured?: boolean;
  skip: number;
  take: number;
}

export interface ProductPage {
  items: Producto[];
  total: number;
}

export interface CreateProductData {
  restaurantId: string;
  name: string;
  description?: string | null;
  category: ProductCategory;
  price: number;
  status?: ProductStatus;
  featured?: boolean;
}

export interface UpdateProductData {
  name?: string;
  description?: string | null;
  category?: ProductCategory;
  price?: number;
  status?: ProductStatus;
}

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

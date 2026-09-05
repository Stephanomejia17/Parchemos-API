import { ProductCategory } from '../../domain/enums/product-category.enum';
import { ProductStatus } from '../../domain/enums/product-status.enum';

export interface CreateProductCommand {
  name: string;
  description?: string | null;
  category: ProductCategory;
  price: number;
  status?: ProductStatus;
}

export interface UpdateProductCommand {
  name?: string;
  description?: string | null;
  category?: ProductCategory;
  price?: number;
  status?: ProductStatus;
}

export interface ListProductsQuery {
  category?: ProductCategory;
  status?: ProductStatus;
  featured?: boolean;
  skip: number;
  take: number;
}

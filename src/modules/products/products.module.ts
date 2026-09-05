import { Module } from '@nestjs/common';
import { ProductsController } from './infrastructure/http/products.controller';
import { PRODUCTO_REPOSITORY } from './domain/repositories/producto.repository';
import { PrismaProductoRepository } from './infrastructure/persistence/prisma-producto.repository';
import { PRODUCT_IMAGE_STORAGE } from './domain/services/product-image-storage';
import { SupabaseProductImageStorage } from './infrastructure/storage/supabase-product-image-storage';
import { ProductAccess } from './application/use-cases/product-access';
import { CreateProductUseCase, DeactivateProductUseCase, GetProductUseCase, ListProductsUseCase, SetProductFeaturedUseCase, UpdateProductUseCase, UploadProductImageUseCase } from './application/use-cases/product.use-cases';

@Module({
  controllers: [ProductsController],
  providers: [
    ProductAccess,
    CreateProductUseCase,
    ListProductsUseCase,
    GetProductUseCase,
    UpdateProductUseCase,
    DeactivateProductUseCase,
    SetProductFeaturedUseCase,
    UploadProductImageUseCase,
    { provide: PRODUCTO_REPOSITORY, useClass: PrismaProductoRepository },
    { provide: PRODUCT_IMAGE_STORAGE, useClass: SupabaseProductImageStorage },
  ],
})
export class ProductsModule {}

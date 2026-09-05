import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param,
  ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageUploadOptions } from '../../../../common/http/image-upload.options';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { CreateProductUseCase, DeactivateProductUseCase, GetProductUseCase, ListProductsUseCase, SetProductFeaturedUseCase, UpdateProductUseCase, UploadProductImageUseCase } from '../../application/use-cases/product.use-cases';
import { CreateProductoDto } from './create-product.dto';
import { ListProductosDto } from './list-products.dto';
import { SetFeaturedDto } from './set-featured.dto';
import { UpdateProductoDto } from './update-product.dto';

@Controller()
export class ProductsController {
  constructor(
    private readonly createProduct: CreateProductUseCase,
    private readonly listProducts: ListProductsUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly deactivateProduct: DeactivateProductUseCase,
    private readonly setProductFeatured: SetProductFeaturedUseCase,
    private readonly uploadProductImage: UploadProductImageUseCase,
  ) {}

  @Post('restaurantes/:restaurantId/productos')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  async create(@Param('restaurantId', ParseUUIDPipe) restaurantId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductoDto) {
    const product = await this.createProduct.execute(restaurantId, user.id, user.role, dto);
    return { success: true, data: product, message: 'Producto creado correctamente.' };
  }

  @Get('restaurantes/:restaurantId/productos')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  async list(@Param('restaurantId', ParseUUIDPipe) restaurantId: string, @CurrentUser() user: AuthenticatedUser, @Query() query: ListProductosDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.listProducts.execute(restaurantId, user.id, user.role, {
      category: query.category, status: query.status, featured: query.featured,
      skip: (page - 1) * limit, take: limit,
    });
    return {
      success: true,
      data: { items: result.items, pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) } },
      message: 'Productos consultados correctamente.',
    };
  }

  @Get('productos/:id')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: await this.getProduct.execute(id, user.id, user.role), message: 'Producto consultado correctamente.' };
  }

  @Patch('productos/:id')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  async update(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProductoDto) {
    return { success: true, data: await this.updateProduct.execute(id, user.id, user.role, dto), message: 'Producto actualizado correctamente.' };
  }

  @Delete('productos/:id')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: await this.deactivateProduct.execute(id, user.id, user.role), message: 'Producto desactivado correctamente.' };
  }

  @Patch('productos/:id/destacado')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  async setFeatured(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: SetFeaturedDto) {
    return { success: true, data: await this.setProductFeatured.execute(id, user.id, user.role, dto.featured), message: dto.featured ? 'Producto destacado.' : 'Producto retirado de destacados.' };
  }

  @Post('productos/:id/imagen')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  async uploadImage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @UploadedFile() file: UploadedProductImageFile) {
    if (!file) throw new BadRequestException('Debes adjuntar un archivo en el campo "file".');
    return { success: true, data: await this.uploadProductImage.execute(id, user.id, user.role, file), message: 'Imagen del producto actualizada correctamente.' };
  }
}

interface UploadedProductImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

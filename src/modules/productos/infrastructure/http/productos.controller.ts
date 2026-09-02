import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param,
  ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { ProductosService } from '../../application/productos.service';
import { CreateProductoDto } from '../../application/dto/create-producto.dto';
import { ListProductosDto } from '../../application/dto/list-productos.dto';
import { SetFeaturedDto } from '../../application/dto/set-featured.dto';
import { UpdateProductoDto } from '../../application/dto/update-producto.dto';

@Controller()
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  @Post('restaurantes/:restaurantId/productos')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  async create(@Param('restaurantId', ParseUUIDPipe) restaurantId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductoDto) {
    const product = await this.productos.create(restaurantId, user, dto);
    return { success: true, data: product, message: 'Producto creado correctamente.' };
  }

  @Get('restaurantes/:restaurantId/productos')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  async list(@Param('restaurantId', ParseUUIDPipe) restaurantId: string, @CurrentUser() user: AuthenticatedUser, @Query() query: ListProductosDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.productos.list(restaurantId, user, {
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
    return { success: true, data: await this.productos.findOne(id, user), message: 'Producto consultado correctamente.' };
  }

  @Patch('productos/:id')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  async update(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProductoDto) {
    return { success: true, data: await this.productos.update(id, user, dto), message: 'Producto actualizado correctamente.' };
  }

  @Delete('productos/:id')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, data: await this.productos.remove(id, user), message: 'Producto desactivado correctamente.' };
  }

  @Patch('productos/:id/destacado')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  async setFeatured(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: SetFeaturedDto) {
    return { success: true, data: await this.productos.setFeatured(id, user, dto.featured), message: dto.featured ? 'Producto destacado.' : 'Producto retirado de destacados.' };
  }

  @Post('productos/:id/imagen')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @UploadedFile() file: UploadedProductImageFile) {
    if (!file) throw new BadRequestException('Debes adjuntar un archivo en el campo "file".');
    return { success: true, data: await this.productos.uploadImage(id, user, file), message: 'Imagen del producto actualizada correctamente.' };
  }
}

interface UploadedProductImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

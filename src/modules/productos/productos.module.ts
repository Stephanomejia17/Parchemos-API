import { Module } from '@nestjs/common';
import { ProductosService } from './application/productos.service';
import { ProductosController } from './infrastructure/http/productos.controller';
import { PRODUCTO_REPOSITORY } from './domain/repositories/producto.repository';
import { PrismaProductoRepository } from './infrastructure/persistence/prisma-producto.repository';

@Module({
  controllers: [ProductosController],
  providers: [ProductosService, { provide: PRODUCTO_REPOSITORY, useClass: PrismaProductoRepository }],
})
export class ProductosModule {}

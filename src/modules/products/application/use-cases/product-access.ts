import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { NotFoundError } from '../../../../common/errors/not-found-error';
import { Role } from '../../../../common/enums/role.enum';
import { PRODUCTO_REPOSITORY } from '../../domain/repositories/producto.repository';
import type { ProductoRepository } from '../../domain/repositories/producto.repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ProductAccess {
  constructor(@Inject(PRODUCTO_REPOSITORY) private readonly products: ProductoRepository) {}

  async assertRestaurantAccess(restaurantId: string, userId: string, role: Role): Promise<void> {
    if (!(await this.products.restaurantExists(restaurantId))) {
      throw new NotFoundError('El restaurante no existe.', 'RESTAURANT_NOT_FOUND');
    }
    if (role === Role.ADMINISTRADOR) return;
    if (role !== Role.RESTAURANTE || !(await this.products.restaurantBelongsToUser(restaurantId, userId))) {
      throw new ForbiddenError('No tienes permisos para gestionar productos de este restaurante.');
    }
  }
}

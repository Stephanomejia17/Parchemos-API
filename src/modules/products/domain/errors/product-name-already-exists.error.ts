import { ConflictError } from '../../../../common/errors/conflict-error';

export class ProductNameAlreadyExistsError extends ConflictError {
  constructor() {
    super('Ya existe un producto con ese nombre en este restaurante.', 'PRODUCT_NAME_ALREADY_EXISTS');
  }
}

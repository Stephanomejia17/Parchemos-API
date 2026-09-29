import { ConflictError } from '../../../../common/errors/conflict-error';

export class MesaCodeAlreadyExistsError extends ConflictError {
  constructor() {
    super(
      'Ya existe una mesa con ese código en la sede.',
      'TABLE_CODE_ALREADY_EXISTS',
    );
  }
}

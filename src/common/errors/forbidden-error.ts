import { DomainError } from './domain-error';

/** 403 - identidad conocida, pero sin permiso para esta accion o recurso. */
export class ForbiddenError extends DomainError {
  readonly statusCode = 403;

  constructor(
    message: string,
    readonly code: string = 'FORBIDDEN',
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

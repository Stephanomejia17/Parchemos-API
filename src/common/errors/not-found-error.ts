import { DomainError } from './domain-error';

/** 404 - el recurso pedido no existe (o no es visible para quien pregunta). */
export class NotFoundError extends DomainError {
  readonly statusCode = 404;

  constructor(
    message: string,
    readonly code: string = 'NOT_FOUND',
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

import { DomainError } from './domain-error';

/** 409 - el estado actual del recurso choca con la operacion pedida. */
export class ConflictError extends DomainError {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code: string = 'CONFLICT',
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

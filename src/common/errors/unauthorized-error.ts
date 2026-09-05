import { DomainError } from './domain-error';

/**
 * 401 - no hay identidad valida (credenciales incorrectas, token invalido o
 * ausente). No estaba en la lista original del plan (domain/validation/
 * not-found/forbidden/conflict), pero login y refresh la necesitan: 401 y 403
 * son estados HTTP distintos y el frontend puede depender de esa diferencia
 * para decidir si reintenta el login.
 */
export class UnauthorizedError extends DomainError {
  readonly statusCode = 401;

  constructor(
    message: string,
    readonly code: string = 'UNAUTHORIZED',
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

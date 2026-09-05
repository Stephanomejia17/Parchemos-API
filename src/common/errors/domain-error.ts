/**
 * Base de los errores de negocio. No conoce HTTP: el mapeo a status code
 * ocurre solo en HttpExceptionFilter, para que domain/application puedan
 * lanzar estos errores sin importar Nest.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  protected constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

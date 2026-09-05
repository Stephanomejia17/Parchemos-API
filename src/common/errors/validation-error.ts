import { DomainError } from './domain-error';

/** 400 - el input no cumple una regla de negocio (no un typo de sintaxis: eso ya lo filtra el ValidationPipe). */
export class ValidationError extends DomainError {
  readonly statusCode = 400;

  constructor(
    message: string,
    readonly code: string = 'VALIDATION_ERROR',
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

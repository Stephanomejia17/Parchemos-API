import { DomainError } from './domain-error';

/** 429 - se agoto un cupo de uso (p. ej. un insight de IA por dia). */
export class TooManyRequestsError extends DomainError {
  readonly statusCode = 429;

  constructor(
    message: string,
    readonly code: string = 'TOO_MANY_REQUESTS',
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

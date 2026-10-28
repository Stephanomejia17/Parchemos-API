import { DomainError } from './domain-error';

/** 503 - un servicio externo no esta configurado o no respondio. */
export class ServiceUnavailableError extends DomainError {
  readonly statusCode = 503;

  constructor(
    message: string,
    readonly code: string = 'SERVICE_UNAVAILABLE',
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

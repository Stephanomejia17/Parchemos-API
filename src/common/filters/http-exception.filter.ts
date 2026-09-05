import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '../errors/domain-error';

interface ResolvedError {
  statusCode: number;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
}

/**
 * Unico punto que traduce errores a HTTP. domain/application lanzan
 * DomainError (o, mientras no todos los modulos migran, excepciones de Nest);
 * aqui se normalizan al formato de respuesta estandar de la API.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const { statusCode, code, message, extra } = resolve(exception);

    response.status(statusCode).json({
      success: false,
      data: null,
      message,
      code,
      statusCode,
      timestamp: new Date().toISOString(),
      ...extra,
    });
  }
}

function resolve(exception: unknown): ResolvedError {
  if (exception instanceof DomainError) {
    return {
      statusCode: exception.statusCode,
      code: exception.code,
      message: exception.message,
      extra: exception.details,
    };
  }

  if (exception instanceof HttpException) {
    return resolveHttpException(exception);
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'Error interno del servidor',
  };
}

function resolveHttpException(exception: HttpException): ResolvedError {
  const statusCode = exception.getStatus();
  const body = exception.getResponse();

  if (typeof body === 'string') {
    return { statusCode, code: codeForStatus(statusCode), message: body };
  }

  const { message, code } = body as { message?: unknown; code?: unknown };
  const resolvedMessage = Array.isArray(message)
    ? message.join(' ')
    : typeof message === 'string'
      ? message
      : exception.message;

  return {
    statusCode,
    code: typeof code === 'string' ? code : codeForStatus(statusCode),
    message: resolvedMessage,
    extra: extractExtra(body, ['message', 'code', 'statusCode', 'error']),
  };
}

function extractExtra(
  body: unknown,
  knownKeys: string[],
): Record<string, unknown> | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!knownKeys.includes(key)) rest[key] = value;
  }
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function codeForStatus(statusCode: number): string {
  switch (statusCode) {
    // Valores de HttpStatus escritos como numero: el switch discrimina sobre
    // `number`, no sobre el enum, y comparar contra HttpStatus.X ahi dispara
    // no-unsafe-enum-comparison.
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    default:
      return 'ERROR';
  }
}

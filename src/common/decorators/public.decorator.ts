import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca un endpoint como accesible sin token (login, registro, refresh). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const OPTIONAL_AUTH_KEY = 'optionalAuth';

/**
 * Junto con `@Public()`: el endpoint sigue abierto, pero si llega un token
 * valido se identifica al usuario (`request.user`) para personalizar la
 * respuesta (p. ej. marcar favoritos). Un token invalido o vencido se ignora:
 * nunca convierte una lectura publica en un error.
 */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

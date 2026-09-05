import { ValidationError } from '../../../../common/errors/validation-error';

/** Latitud y longitud son opcionales, pero si viene una debe venir la otra. */
export function assertValidCoordinates(input: {
  latitude?: number;
  longitude?: number;
}): void {
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    throw new ValidationError(
      'Debes indicar latitud y longitud juntas.',
      'INVALID_COORDINATES',
    );
  }
}

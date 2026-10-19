import { ValidationError } from '../../../common/errors/validation-error';

/** Fechas AAAA-MM-DD interpretadas en hora de Colombia (America/Bogota). */
export interface RangoFechas {
  desde: string;
  hasta: string;
}

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

function esFechaReal(valor: string): boolean {
  if (!FORMATO.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return (
    !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
  );
}

/** RN4: el rango es válido solo si fecha final >= fecha inicial. */
export function crearRangoFechas(desde: string, hasta: string): RangoFechas {
  if (!esFechaReal(desde) || !esFechaReal(hasta)) {
    throw new ValidationError(
      'Las fechas deben existir y tener el formato AAAA-MM-DD.',
      'INVALID_DATE',
    );
  }
  if (hasta < desde) {
    throw new ValidationError(
      'La fecha final no puede ser anterior a la fecha inicial.',
      'INVALID_DATE_RANGE',
    );
  }
  return { desde, hasta };
}

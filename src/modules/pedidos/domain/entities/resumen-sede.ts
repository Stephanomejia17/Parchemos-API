/** GP-05: indicadores del día para el panel de sala de una sede. */
export interface ResumenSede {
  /** Pedidos confirmados hoy (sin borradores). */
  ordenesHoy: number;
  /** Pedidos confirmados que aún no se entregan ni se cancelan. */
  pendientes: number;
  /** Mesas activas con al menos un pedido en curso. */
  mesasOcupadas: number;
  /** Mesas activas de la sede. */
  mesasTotales: number;
  /** Pedidos entregados hoy. */
  entregadasHoy: number;
}

/** Colombia no tiene horario de verano: siempre UTC-5. */
const OFFSET_BOGOTA_MS = -5 * 60 * 60 * 1000;

/** Medianoche de hoy en Bogotá, expresada como instante UTC. */
export function inicioDelDiaEnBogota(ahora: Date): Date {
  const local = new Date(ahora.getTime() + OFFSET_BOGOTA_MS);
  const medianocheLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  return new Date(medianocheLocal - OFFSET_BOGOTA_MS);
}

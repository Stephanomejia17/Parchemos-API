/** Dashboard que se analiza. Coincide con el enum insight_scope de la base. */
export type InsightScope = 'restaurante' | 'administrador';

export interface InsightHallazgo {
  titulo: string;
  detalle: string;
  tipo: 'positivo' | 'alerta' | 'neutral';
}

export interface InsightRecomendacion {
  accion: string;
  motivo: string;
  prioridad: 'alta' | 'media' | 'baja';
}

/** Lo que devuelve el modelo, ya validado. */
export interface InsightContent {
  resumen: string;
  hallazgos: InsightHallazgo[];
  recomendaciones: InsightRecomendacion[];
}

export interface Insight {
  id: string;
  scope: InsightScope;
  /** Dia (AAAA-MM-DD, hora de Colombia) al que se cargo la solicitud. */
  fecha: string;
  rango: { desde: string; hasta: string };
  restauranteId: string | null;
  contenido: InsightContent;
  modelo: string;
  generadoEn: string;
}

/** Fecha de hoy en Colombia (AAAA-MM-DD): el cupo se reinicia a medianoche local. */
export function hoyEnColombia(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** Dia siguiente a `fecha` (AAAA-MM-DD). */
export function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

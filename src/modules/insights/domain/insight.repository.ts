import type { Insight, InsightContent, InsightScope } from './insight';

export interface ReservaInsight {
  userId: string;
  scope: InsightScope;
  fecha: string;
  rango: { desde: string; hasta: string };
  restauranteId: string | null;
}

export interface EstadoInsightDelDia {
  /** Insight ya generado hoy, si existe. */
  insight: Insight | null;
  /** Si hay una generacion en curso, cuando empezo. */
  generandoDesde: Date | null;
}

export interface InsightRepository {
  delDia(
    userId: string,
    scope: InsightScope,
    fecha: string,
  ): Promise<EstadoInsightDelDia>;
  /** Ocupa el cupo del dia. Devuelve null si ya estaba ocupado. */
  reservar(reserva: ReservaInsight): Promise<string | null>;
  /** Libera una reserva que quedo colgada (p. ej. el proceso murio). */
  liberarSiEstancada(
    userId: string,
    scope: InsightScope,
    fecha: string,
    iniciadaAntesDe: Date,
  ): Promise<boolean>;
  completar(
    id: string,
    contenido: InsightContent,
    modelo: string,
  ): Promise<Insight>;
  liberar(id: string): Promise<void>;
}

export const INSIGHT_REPOSITORY = Symbol('INSIGHT_REPOSITORY');

import type { InsightContent, InsightScope } from './insight';

export interface SolicitudInsight {
  scope: InsightScope;
  rango: { desde: string; hasta: string };
  /** Datos agregados del dashboard; se envian tal cual al modelo. */
  datos: Record<string, unknown>;
}

export interface InsightGenerado {
  contenido: InsightContent;
  modelo: string;
}

/** Puerto hacia el modelo de lenguaje que redacta el analisis. */
export interface InsightGenerator {
  generar(solicitud: SolicitudInsight): Promise<InsightGenerado>;
}

export const INSIGHT_GENERATOR = Symbol('INSIGHT_GENERATOR');

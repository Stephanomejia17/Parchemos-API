import type { RangoFechas } from '../../domain/rango-fechas';

export type TipoAfiliado = 'restaurante' | 'repartidor';

export interface PuntoVentas {
  fecha: string; // AAAA-MM-DD
  ingresosBrutos: number;
  comision: number;
  pedidos: number;
}

/** AE-01 (RN1): bruto = sum(gross_amount), comisión = sum(commission_amount). */
export interface ResumenRestaurante {
  totales: { ingresosBrutos: number; comisionTotal: number; pedidos: number };
  serie: PuntoVentas[];
}

/** AE-02: restaurante -> bruto y comisión; repartidor -> solo pago (RN3). */
export interface FilaAfiliado {
  tipo: TipoAfiliado;
  afiliadoId: string;
  nombre: string;
  montoBruto: number | null;
  comisionOPago: number;
  pedidos: number;
}

export interface PuntoUso {
  fecha: string;
  usuariosActivos: number;
  usuariosNuevos: number;
  publicaciones: number;
  likes: number;
  visualizaciones: number;
}

export interface ContenidoDestacado {
  postId: string;
  descripcion: string;
  autor: string;
  sede: string | null;
  likes: number;
  imagenes: number;
  videos: number;
}

export interface TendenciasUso {
  serie: PuntoUso[];
  topContenido: ContenidoDestacado[];
}

export interface FiltroAfiliados {
  tipo?: TipoAfiliado;
  afiliadoId?: string;
}

export interface EstadisticasRepository {
  restauranteEsDe(restauranteId: string, duenoId: string): Promise<boolean>;
  resumenRestaurante(
    duenoId: string,
    rango: RangoFechas,
    restauranteId?: string,
  ): Promise<ResumenRestaurante>;
  ingresosAfiliados(
    rango: RangoFechas,
    filtro: FiltroAfiliados,
  ): Promise<FilaAfiliado[]>;
  tendencias(rango: RangoFechas, restauranteId?: string): Promise<TendenciasUso>;
}

export const ESTADISTICAS_REPOSITORY = Symbol('ESTADISTICAS_REPOSITORY');

import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { ForbiddenError } from '../../../common/errors/forbidden-error';
import { NotFoundError } from '../../../common/errors/not-found-error';
import { crearRangoFechas } from '../domain/rango-fechas';
import { ESTADISTICAS_REPOSITORY } from '../domain/repositories/estadisticas.repository';
import type {
  EstadisticasRepository,
  TipoAfiliado,
} from '../domain/repositories/estadisticas.repository';

export interface ConsultaRestaurante {
  desde: string;
  hasta: string;
  restauranteId?: string;
}

export interface ConsultaAfiliados {
  desde: string;
  hasta: string;
  tipo?: TipoAfiliado;
  afiliadoId?: string;
}

@Injectable()
export class EstadisticasService {
  constructor(
    @Inject(ESTADISTICAS_REPOSITORY)
    private readonly repo: EstadisticasRepository,
  ) {}

  /** AE-01. El dueño solo ve sus restaurantes (CA13). */
  async resumenRestaurante(user: AuthenticatedUser, q: ConsultaRestaurante) {
    const rango = crearRangoFechas(q.desde, q.hasta);
    if (
      q.restauranteId &&
      !(await this.repo.restauranteEsDe(q.restauranteId, user.id))
    ) {
      throw new ForbiddenError(
        'No tienes acceso a este restaurante.',
        'STATS_FORBIDDEN',
      );
    }
    const resumen = await this.repo.resumenRestaurante(
      user.id,
      rango,
      q.restauranteId,
    );
    return { rango, ...resumen, sinDatos: resumen.totales.pedidos === 0 };
  }

  /** RN5: el reporte sale de la misma consulta que el dashboard. */
  async datosParaReporte(user: AuthenticatedUser, q: ConsultaRestaurante) {
    const datos = await this.resumenRestaurante(user, q);
    if (datos.sinDatos) {
      throw new NotFoundError(
        'No hay información para ese período.',
        'STATS_NO_DATA',
      );
    }
    return datos;
  }

  /** AE-02. */
  async ingresosAfiliados(q: ConsultaAfiliados) {
    const rango = crearRangoFechas(q.desde, q.hasta);
    const filas = await this.repo.ingresosAfiliados(rango, {
      tipo: q.tipo,
      afiliadoId: q.afiliadoId,
    });
    return { rango, filas, sinDatos: filas.length === 0 };
  }

  /** AE-03. Analiza la actividad disponible sin exigir un mínimo histórico. */
  async tendencias(desde: string, hasta: string, restauranteId?: string) {
    const rango = crearRangoFechas(desde, hasta);
    const datos = await this.repo.tendencias(rango, restauranteId);
    return { rango, suficiente: true, ...datos };
  }
}

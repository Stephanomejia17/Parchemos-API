import { Inject, Injectable, Optional } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { ConflictError } from '../../../common/errors/conflict-error';
import { TooManyRequestsError } from '../../../common/errors/too-many-requests-error';
import { ValidationError } from '../../../common/errors/validation-error';
import { EstadisticasService } from '../../estadisticas/application/estadisticas.service';
import { crearRangoFechas } from '../../estadisticas/domain/rango-fechas';
import type { RangoFechas } from '../../estadisticas/domain/rango-fechas';
import { diaSiguiente, hoyEnColombia } from '../domain/insight';
import type { Insight, InsightScope } from '../domain/insight';
import { INSIGHT_GENERATOR } from '../domain/insight-generator';
import type { InsightGenerator } from '../domain/insight-generator';
import { INSIGHT_REPOSITORY } from '../domain/insight.repository';
import type { InsightRepository } from '../domain/insight.repository';

/** Rango maximo analizable: acota el tamano (y el costo) de cada solicitud. */
const MAX_DIAS_RANGO = 366;
/** Una reserva `generando` mas vieja que esto se considera abandonada. */
const RESERVA_ESTANCADA_MS = 5 * 60_000;

/** Reloj inyectable para las pruebas. */
export const INSIGHTS_CLOCK = Symbol('INSIGHTS_CLOCK');

export interface ConsultaInsight {
  desde: string;
  hasta: string;
  restauranteId?: string;
}

export interface EstadoInsight {
  insight: Insight | null;
  /** true si el usuario aun puede pedir el insight de hoy. */
  disponible: boolean;
  /** Dia (AAAA-MM-DD, hora de Colombia) en que se libera el siguiente cupo. */
  proximoDisponible: string;
}

/**
 * Insights de IA sobre los dashboards. Regla: una solicitud por usuario,
 * dashboard y dia (hora de Colombia). La impone la clave unica de
 * ai_insights, asi que dos peticiones simultaneas no pueden pasar ambas.
 * Si la IA falla, la reserva se libera y el cupo no se pierde.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly estadisticas: EstadisticasService,
    @Inject(INSIGHT_REPOSITORY) private readonly repo: InsightRepository,
    @Inject(INSIGHT_GENERATOR) private readonly generator: InsightGenerator,
    @Optional() @Inject(INSIGHTS_CLOCK) reloj?: () => Date,
  ) {
    this.ahora = reloj ?? (() => new Date());
  }

  private readonly ahora: () => Date;

  async estado(
    user: AuthenticatedUser,
    scope: InsightScope,
  ): Promise<EstadoInsight> {
    const hoy = hoyEnColombia(this.ahora());
    const { insight, generandoDesde } = await this.repo.delDia(
      user.id,
      scope,
      hoy,
    );
    const ocupado =
      insight !== null ||
      (generandoDesde !== null && !this.estancada(generandoDesde));
    return {
      insight,
      disponible: !ocupado,
      proximoDisponible: ocupado ? diaSiguiente(hoy) : hoy,
    };
  }

  async generarRestaurante(
    user: AuthenticatedUser,
    q: ConsultaInsight,
  ): Promise<Insight> {
    const rango = this.validarRango(q);
    // Valida la propiedad del restaurante antes de gastar el cupo.
    const resumen = await this.estadisticas.resumenRestaurante(user, q);
    return this.generar(user, 'restaurante', rango, q.restauranteId ?? null, {
      totales: resumen.totales,
      serieDiaria: resumen.serie,
      sinDatos: resumen.sinDatos,
      filtro: q.restauranteId
        ? 'un restaurante'
        : 'todos los restaurantes del dueno',
    });
  }

  async generarAdministrador(
    user: AuthenticatedUser,
    q: ConsultaInsight,
  ): Promise<Insight> {
    const rango = this.validarRango(q);
    const [tendencias, afiliados] = await Promise.all([
      this.estadisticas.tendencias(rango.desde, rango.hasta),
      this.estadisticas.ingresosAfiliados(rango),
    ]);
    return this.generar(user, 'administrador', rango, null, {
      actividadDiaria: tendencias.serie,
      // Sin el autor: no hace falta enviar nombres de personas al modelo.
      contenidoDestacado: tendencias.topContenido.map((post) => ({
        descripcion: post.descripcion,
        sede: post.sede,
        likes: post.likes,
        visualizaciones: post.visualizaciones,
        imagenes: post.imagenes,
        videos: post.videos,
      })),
      afiliados: afiliados.filas,
    });
  }

  private async generar(
    user: AuthenticatedUser,
    scope: InsightScope,
    rango: RangoFechas,
    restauranteId: string | null,
    datos: Record<string, unknown>,
  ): Promise<Insight> {
    const hoy = hoyEnColombia(this.ahora());
    const id = await this.reservarCupo(
      user.id,
      scope,
      hoy,
      rango,
      restauranteId,
    );
    try {
      const { contenido, modelo } = await this.generator.generar({
        scope,
        rango,
        datos,
      });
      return await this.repo.completar(id, contenido, modelo);
    } catch (error) {
      await this.repo.liberar(id);
      throw error;
    }
  }

  private async reservarCupo(
    userId: string,
    scope: InsightScope,
    hoy: string,
    rango: RangoFechas,
    restauranteId: string | null,
  ): Promise<string> {
    const reserva = { userId, scope, fecha: hoy, rango, restauranteId };
    const id = await this.repo.reservar(reserva);
    if (id) return id;

    const { insight, generandoDesde } = await this.repo.delDia(
      userId,
      scope,
      hoy,
    );
    if (insight) {
      throw new TooManyRequestsError(
        'Ya generaste el insight de hoy. Podrás pedir uno nuevo mañana.',
        'INSIGHT_DAILY_LIMIT',
        { proximoDisponible: diaSiguiente(hoy) },
      );
    }
    const abandonada =
      generandoDesde !== null && this.estancada(generandoDesde);
    if (abandonada) {
      const cutoff = new Date(this.ahora().getTime() - RESERVA_ESTANCADA_MS);
      await this.repo.liberarSiEstancada(userId, scope, hoy, cutoff);
    }
    // Reintenta si la reserva estaba abandonada o se libero entre las dos consultas.
    if (abandonada || generandoDesde === null) {
      const reintento = await this.repo.reservar(reserva);
      if (reintento) return reintento;
    }
    throw new ConflictError(
      'El insight de hoy ya se está generando. Espera unos segundos.',
      'INSIGHT_IN_PROGRESS',
    );
  }

  private estancada(desde: Date): boolean {
    return this.ahora().getTime() - desde.getTime() > RESERVA_ESTANCADA_MS;
  }

  private validarRango(q: ConsultaInsight): RangoFechas {
    const rango = crearRangoFechas(q.desde, q.hasta);
    const dias =
      (Date.parse(`${rango.hasta}T00:00:00Z`) -
        Date.parse(`${rango.desde}T00:00:00Z`)) /
        86_400_000 +
      1;
    if (dias > MAX_DIAS_RANGO) {
      throw new ValidationError(
        `El rango para el insight no puede superar ${MAX_DIAS_RANGO} días.`,
        'INSIGHT_RANGE_TOO_LONG',
      );
    }
    return rango;
  }
}

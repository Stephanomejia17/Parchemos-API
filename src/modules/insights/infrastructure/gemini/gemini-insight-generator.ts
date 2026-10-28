import { ApiError, FinishReason, GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableError } from '../../../../common/errors/service-unavailable-error';
import type { AppEnv } from '../../../../config/env.validation';
import type { InsightContent, InsightScope } from '../../domain/insight';
import type {
  InsightGenerado,
  InsightGenerator,
  SolicitudInsight,
} from '../../domain/insight-generator';

/**
 * Modelos en orden de preferencia. Si uno esta saturado (5xx), retirado (404)
 * o sin cuota (429), se pasa al siguiente. Los alias `-latest` apuntan
 * siempre al Gemini estable mas reciente de cada familia.
 */
const MODELOS_POR_DEFECTO = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

/** Errores de Gemini que justifican probar con el siguiente modelo. */
const debeProbarOtroModelo = (error: unknown): boolean =>
  error instanceof ApiError &&
  (error.status >= 500 || error.status === 404 || error.status === 429);

/** Formato de respuesta que se le exige a Gemini (JSON Schema). */
const SCHEMA_INSIGHT = {
  type: 'object',
  additionalProperties: false,
  required: ['resumen', 'hallazgos', 'recomendaciones'],
  properties: {
    resumen: { type: 'string' },
    hallazgos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'detalle', 'tipo'],
        properties: {
          titulo: { type: 'string' },
          detalle: { type: 'string' },
          tipo: { type: 'string', enum: ['positivo', 'alerta', 'neutral'] },
        },
      },
    },
    recomendaciones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['accion', 'motivo', 'prioridad'],
        properties: {
          accion: { type: 'string' },
          motivo: { type: 'string' },
          prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
      },
    },
  },
};

const INSTRUCCIONES_COMUNES = `Eres el analista de datos de Parchemos, una plataforma colombiana para descubrir restaurantes, pedir y reservar. Recibes datos agregados de un dashboard y redactas insights accionables en español neutro de Colombia.

Reglas:
- Básate solo en los datos recibidos. No inventes cifras, causas ni datos de mercado; si algo es una hipótesis, dilo.
- Los importes están en pesos colombianos (COP). Escríbelos como $1.234.567.
- Las fechas son días en hora de Colombia (AAAA-MM-DD).
- "resumen": 2 a 3 frases con lo más importante del período.
- "hallazgos": entre 3 y 5, cada uno con una cifra o comparación concreta (tendencia, picos, días flojos, concentración, variación entre la primera y la segunda mitad del período). tipo = positivo, alerta o neutral.
- "recomendaciones": entre 2 y 4 acciones concretas que el usuario pueda ejecutar, priorizadas.
- Si hay pocos datos o ninguno, dilo en el resumen y recomienda cómo empezar a generar actividad; no fuerces conclusiones.`;

const CONTEXTO: Record<InsightScope, string> = {
  restaurante: `Le hablas al dueño de un restaurante. Los datos son sus ventas: ingresos brutos, la comisión que cobra Parchemos y el número de pedidos no cancelados, por día. Enfócate en ventas, ticket promedio (ingresos / pedidos), días de la semana fuertes y débiles, y el peso de la comisión.`,
  administrador: `Le hablas al administrador de la plataforma. Los datos son la actividad global (usuarios activos y nuevos, publicaciones, likes por día), el contenido destacado y los ingresos por afiliado (restaurantes: monto bruto y comisión; repartidores: pago). Enfócate en crecimiento y retención de usuarios, engagement del contenido, concentración de ingresos en pocos afiliados y afiliados con baja actividad.`,
};

const BLOQUEOS = new Set<FinishReason>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

const esTexto = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '';
const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/**
 * Valida la forma del JSON: el schema guia a Gemini, pero lo que se guarda y
 * se muestra no debe depender de que el modelo lo haya cumplido al pie.
 */
export function parsearInsight(texto: string): InsightContent | null {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!esObjeto(json) || !esTexto(json.resumen)) return null;
  const { hallazgos, recomendaciones } = json;
  if (!Array.isArray(hallazgos) || !Array.isArray(recomendaciones)) return null;
  const tipos = ['positivo', 'alerta', 'neutral'];
  const prioridades = ['alta', 'media', 'baja'];
  return {
    resumen: json.resumen,
    hallazgos: hallazgos
      .filter(esObjeto)
      .filter((h) => esTexto(h.titulo) && esTexto(h.detalle))
      .map((h) => ({
        titulo: h.titulo as string,
        detalle: h.detalle as string,
        tipo: (tipos.includes(h.tipo as string)
          ? h.tipo
          : 'neutral') as InsightContent['hallazgos'][number]['tipo'],
      })),
    recomendaciones: recomendaciones
      .filter(esObjeto)
      .filter((r) => esTexto(r.accion) && esTexto(r.motivo))
      .map((r) => ({
        accion: r.accion as string,
        motivo: r.motivo as string,
        prioridad: (prioridades.includes(r.prioridad as string)
          ? r.prioridad
          : 'media') as InsightContent['recomendaciones'][number]['prioridad'],
      })),
  };
}

@Injectable()
export class GeminiInsightGenerator implements InsightGenerator {
  private readonly logger = new Logger(GeminiInsightGenerator.name);
  private readonly client: GoogleGenAI | null;
  private readonly modelos: string[];

  constructor(config: ConfigService<AppEnv, true>) {
    const apiKey = config.get('GEMINI_API_KEY', { infer: true });
    // Reintentos cortos por modelo: si sigue saturado conviene pasar al de
    // respaldo en vez de esperar (por defecto el SDK insiste hasta 5 veces).
    this.client = apiKey
      ? new GoogleGenAI({
          apiKey,
          httpOptions: {
            timeout: 90_000,
            retryOptions: { attempts: 2, initialDelay: 2, maxDelay: 5 },
          },
        })
      : null;
    const configurados = (config.get('INSIGHTS_MODEL', { infer: true }) ?? '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    this.modelos = configurados.length ? configurados : MODELOS_POR_DEFECTO;
  }

  async generar(solicitud: SolicitudInsight): Promise<InsightGenerado> {
    if (!this.client) {
      throw new ServiceUnavailableError(
        'Los insights de IA no están configurados en este servidor.',
        'INSIGHTS_NOT_CONFIGURED',
      );
    }

    const respuesta = await this.llamarConRespaldo(this.client, solicitud);

    const candidato = respuesta.candidates?.[0];
    const bloqueo = respuesta.promptFeedback?.blockReason;
    if (
      bloqueo ||
      (candidato?.finishReason && BLOQUEOS.has(candidato.finishReason))
    ) {
      this.logger.warn(
        `Gemini bloqueó el insight (${bloqueo ?? candidato?.finishReason}).`,
      );
      throw new ServiceUnavailableError(
        'No se pudo generar el insight para estos datos. Intenta con otro rango.',
        'INSIGHT_REFUSED',
      );
    }

    const contenido =
      candidato?.finishReason === FinishReason.MAX_TOKENS
        ? null
        : parsearInsight(respuesta.text ?? '');
    if (!contenido) {
      throw new ServiceUnavailableError(
        'La respuesta de la IA llegó incompleta. Intenta nuevamente.',
        'INSIGHT_INVALID_RESPONSE',
      );
    }

    return { contenido, modelo: respuesta.modelVersion ?? respuesta.modelo };
  }

  private async llamarConRespaldo(
    client: GoogleGenAI,
    solicitud: SolicitudInsight,
  ) {
    let ultimoError: unknown;
    for (const modelo of this.modelos) {
      try {
        const respuesta = await client.models.generateContent({
          model: modelo,
          contents: `Período analizado: ${solicitud.rango.desde} a ${solicitud.rango.hasta}.\n\n<datos>\n${JSON.stringify(solicitud.datos)}\n</datos>`,
          config: {
            systemInstruction: `${INSTRUCCIONES_COMUNES}\n\n${CONTEXTO[solicitud.scope]}`,
            responseMimeType: 'application/json',
            responseJsonSchema: SCHEMA_INSIGHT,
            maxOutputTokens: 16_000,
          },
        });
        return Object.assign(respuesta, { modelo });
      } catch (error) {
        ultimoError = error;
        if (!debeProbarOtroModelo(error)) break;
        this.logger.warn(
          `Gemini ${modelo} no disponible (${(error as ApiError).status}); probando el siguiente modelo.`,
        );
      }
    }
    throw this.traducirError(ultimoError);
  }

  private traducirError(error: unknown): Error {
    if (!(error instanceof ApiError)) {
      this.logger.error(`No se pudo contactar a Gemini: ${String(error)}`);
      return new ServiceUnavailableError(
        'El servicio de IA no respondió. Intenta nuevamente.',
        'INSIGHTS_UPSTREAM_ERROR',
      );
    }
    if (error.status === 429 || error.status === 503) {
      return new ServiceUnavailableError(
        'El servicio de IA está saturado o sin cuota en este momento. Intenta en unos minutos.',
        'INSIGHTS_RATE_LIMITED',
      );
    }
    if (error.status === 401 || error.status === 403) {
      this.logger.error('GEMINI_API_KEY inválida, revocada o sin permisos.');
      return new ServiceUnavailableError(
        'Los insights de IA no están configurados correctamente.',
        'INSIGHTS_NOT_CONFIGURED',
      );
    }
    this.logger.error(
      `Error de la API de Gemini (${error.status}): ${error.message}`,
    );
    return new ServiceUnavailableError(
      'El servicio de IA no respondió. Intenta nuevamente.',
      'INSIGHTS_UPSTREAM_ERROR',
    );
  }
}

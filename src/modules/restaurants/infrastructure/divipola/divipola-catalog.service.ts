import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DEPARTAMENTOS_DIVIPOLA,
  MUNICIPIOS_DIVIPOLA,
} from './divipola-snapshot';

const DANE_URL =
  'https://portalgis.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer';

/** El catalogo casi no cambia: se reutiliza la respuesta del DANE un dia. */
const CACHE_MS = 24 * 60 * 60 * 1000;
/** Si el DANE falla, no se le vuelve a preguntar hasta dentro de una hora. */
const REINTENTO_MS = 60 * 60 * 1000;

export interface DivipolaCatalog {
  departments: { code: string; name: string }[];
  municipalities: {
    departmentCode: string;
    municipalityCode: string;
    department: string;
    municipality: string;
  }[];
}

/**
 * Las direcciones se arman y se leen separando por comas, asi que un nombre
 * como "BOGOTÁ, D.C." las romperia: se guarda como "BOGOTÁ D.C.".
 */
const sinComas = (nombre: string): string =>
  nombre.replace(/\s*,\s*/g, ' ').trim();

interface DaneFeature {
  attributes: Record<string, string | number | null>;
}

interface DaneResponse {
  features?: DaneFeature[];
  error?: {
    code?: number;
    message?: string;
    details?: string[];
  };
}

@Injectable()
export class DivipolaCatalogService {
  private readonly logger = new Logger(DivipolaCatalogService.name);
  private cache: { datos: DivipolaCatalog; hasta: number } | null = null;

  /**
   * Catalogo del DANE; si el servicio del DANE no responde (pasa con
   * frecuencia) se usa la copia incluida en la API, para no bloquear el
   * formulario de sedes.
   */
  async getCatalog(): Promise<DivipolaCatalog> {
    if (this.cache && this.cache.hasta > Date.now()) return this.cache.datos;
    try {
      const datos = await this.getCatalogFromDane();
      this.cache = { datos, hasta: Date.now() + CACHE_MS };
      return datos;
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `El DANE no respondió (${motivo}); se usa la copia local del catálogo DIVIPOLA durante una hora.`,
      );
      const datos = this.cache?.datos ?? catalogoLocal();
      this.cache = { datos, hasta: Date.now() + REINTENTO_MS };
      return datos;
    }
  }

  private async queryLayer(layerId: number): Promise<DaneFeature[]> {
    const params = new URLSearchParams({
      where: '1=1',
      outFields:
        layerId === 319
          ? 'DPTO_CCDGO,DPTO_CNMBRE'
          : 'DPTO_CCDGO,MPIO_CDPMP,DPTO_CNMBRE,MPIO_CNMBRE',
      returnGeometry: 'false',
      f: 'json',
    });

    try {
      const response = await fetch(`${DANE_URL}/${layerId}/query?${params}`, {
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} en la capa ${layerId}`);
      }

      const data = (await response.json()) as DaneResponse;

      if (data.error) {
        throw new Error(
          `capa ${layerId}: ${data.error.message ?? 'respuesta inválida'}`,
        );
      }

      if (!Array.isArray(data.features)) {
        throw new Error('La respuesta del DANE no contiene features.');
      }

      return data.features;
    } catch (error) {
      // getCatalog registra el fallo una sola vez y usa la copia local.
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : 'Sin respuesta del DANE',
      );
    }
  }

  private async getCatalogFromDane(): Promise<DivipolaCatalog> {
    const [departmentFeatures, municipalityFeatures] = await Promise.all([
      this.queryLayer(319),
      this.queryLayer(317),
    ]);

    const departments = departmentFeatures.map(({ attributes }) => ({
      code: String(attributes['DPTO_CCDGO'] ?? attributes['DPTO_CODIGO'] ?? ''),
      name: sinComas(
        String(attributes['DPTO_CNMBRE'] ?? attributes['DPTO_NOMBRE'] ?? ''),
      ),
    }));

    const municipalities = municipalityFeatures.map(({ attributes }) => ({
      departmentCode: String(
        attributes['DPTO_CCDGO'] ?? attributes['DPTO_CODIGO'] ?? '',
      ),
      municipalityCode: String(
        attributes['MPIO_CDPMP'] ?? attributes['MPIO_CODIGO'] ?? '',
      ),
      department: sinComas(
        String(attributes['DPTO_CNMBRE'] ?? attributes['DPTO_NOMBRE'] ?? ''),
      ),
      municipality: sinComas(
        String(attributes['MPIO_CNMBRE'] ?? attributes['MPIO_NOMBRE'] ?? ''),
      ),
    }));

    if (
      departments.some((item) => !item.code || !item.name) ||
      municipalities.some(
        (item) =>
          !item.departmentCode ||
          !item.municipalityCode ||
          !item.department ||
          !item.municipality,
      )
    ) {
      throw new ServiceUnavailableException(
        'El catálogo DIVIPOLA tiene una estructura inesperada.',
      );
    }

    return {
      departments: departments.sort((a, b) =>
        a.name.localeCompare(b.name, 'es'),
      ),
      municipalities: municipalities.sort((a, b) =>
        a.municipality.localeCompare(b.municipality, 'es'),
      ),
    };
  }
}

function catalogoLocal(): DivipolaCatalog {
  const nombres = new Map(DEPARTAMENTOS_DIVIPOLA);
  return {
    departments: DEPARTAMENTOS_DIVIPOLA.map(([code, name]) => ({
      code,
      name: sinComas(name),
    })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    municipalities: MUNICIPIOS_DIVIPOLA.map(
      ([departmentCode, municipalityCode, municipality]) => ({
        departmentCode,
        municipalityCode,
        department: sinComas(nombres.get(departmentCode) ?? ''),
        municipality: sinComas(municipality),
      }),
    ).sort((a, b) => a.municipality.localeCompare(b.municipality, 'es')),
  };
}

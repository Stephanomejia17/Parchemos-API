
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const DANE_URL =
  'https://portalgis.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer';

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
      const response = await fetch(
        `${DANE_URL}/${layerId}/query?${params}`,
        { signal: AbortSignal.timeout(15000) },
      );

      if (!response.ok) {
        throw new Error('Respuesta HTTP inválida del DANE');
      }

      const data = (await response.json()) as DaneResponse;

      if (data.error) {
        console.error(
          `Respuesta de error del DANE para la capa ${layerId}:`,
          JSON.stringify(data.error, null, 2),
        );

        throw new Error(data.error.message ?? 'Respuesta inválida del DANE');
      }

      if (!Array.isArray(data.features)) {
        throw new Error('La respuesta del DANE no contiene features.');
      }

      return data.features;
    } catch (error) {
      console.error(
        `Error consultando la capa DIVIPOLA ${layerId}:`,
        error,
      );

      throw new ServiceUnavailableException(
        'No fue posible consultar el catálogo DIVIPOLA del DANE.',
      );
    }
  }

  async getCatalog() {
    const [departmentFeatures, municipalityFeatures] = await Promise.all([
      this.queryLayer(319),
      this.queryLayer(317),
    ]);

    const departments = departmentFeatures.map(({ attributes }) => ({
      code: String(attributes['DPTO_CCDGO'] ?? attributes['DPTO_CODIGO'] ?? ''),
      name: String(attributes['DPTO_CNMBRE'] ?? attributes['DPTO_NOMBRE'] ?? ''),
    }));

    const municipalities = municipalityFeatures.map(({ attributes }) => ({
      departmentCode: String(
        attributes['DPTO_CCDGO'] ?? attributes['DPTO_CODIGO'] ?? '',
      ),
      municipalityCode: String(
        attributes['MPIO_CDPMP'] ?? attributes['MPIO_CODIGO'] ?? '',
      ),
      department: String(
        attributes['DPTO_CNMBRE'] ?? attributes['DPTO_NOMBRE'] ?? '',
      ),
      municipality: String(
        attributes['MPIO_CNMBRE'] ?? attributes['MPIO_NOMBRE'] ?? '',
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

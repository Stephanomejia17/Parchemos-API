import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValidationError } from '../../../../common/errors/validation-error';

export interface GeocodedAddress {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

interface GeoapifyResult {
  lat?: number;
  lon?: number;
  formatted?: string;
  housenumber?: string;
  country?: string;
  country_code?: string;
  result_type?: string;
  rank?: {
    confidence?: number;
    confidence_building_level?: number;
    match_type?: string;
  };
}

interface GeoapifyResponse {
  results?: GeoapifyResult[];
}

@Injectable()
export class GeoapifyGeocodingService {
  constructor(private readonly config: ConfigService) {}

  async geocode(address: string): Promise<GeocodedAddress> {
    const apiKey = this.config.get<string>('GEOAPIFY_API_KEY');

    if (!apiKey?.trim()) {
      throw new ValidationError(
        'El servicio de ubicación no está configurado. Contacta al administrador.',
        'GEOCODING_UNAVAILABLE',
      );
    }

    const url = new URL('https://api.geoapify.com/v1/geocode/search');
    url.searchParams.set('text', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '5');
    url.searchParams.set('filter', 'countrycode:co');
    url.searchParams.set('apiKey', apiKey);

    let response: Response;

    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new ValidationError(
        'No fue posible consultar la ubicación. Intenta nuevamente.',
        'GEOCODING_FAILED',
      );
    }

    if (!response.ok) {
      throw new ValidationError(
        'El servicio de ubicación no está disponible. Intenta más tarde.',
        'GEOCODING_FAILED',
      );
    }

    let data: GeoapifyResponse;

    try {
      data = (await response.json()) as GeoapifyResponse;
    } catch {
      throw new ValidationError(
        'El servicio de ubicación devolvió una respuesta inválida.',
        'GEOCODING_FAILED',
      );
    }

    const results = data.results ?? [];

    const exactCandidates = results.filter((result) => {
      const matchType = result.rank?.match_type;

      return (
        Number.isFinite(result.lat) &&
        Number.isFinite(result.lon) &&
        result.country_code?.toLowerCase() === 'co' &&
        result.result_type === 'building' &&
        Boolean(result.housenumber?.trim()) &&
        (matchType === 'full_match' || matchType === 'match_by_building') &&
        (result.rank?.confidence_building_level ?? 0) >= 0.8
      );
    });

    if (exactCandidates.length !== 1) {
      throw new ValidationError(
        'No se pudo confirmar el inmueble con suficiente precisión. Verifica la dirección completa e intenta nuevamente.',
        'GEOCODING_AMBIGUOUS',
      );
    }

    const result = exactCandidates[0];

    return {
      latitude: result.lat!,
      longitude: result.lon!,
      formattedAddress: result.formatted ?? address,
    };
  }
}
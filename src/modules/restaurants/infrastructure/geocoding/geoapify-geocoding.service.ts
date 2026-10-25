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
  street?: string;
  housenumber?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  result_type?: string;
  rank?: {
    confidence?: number;
    confidence_building_level?: number;
    confidence_street_level?: number;
    confidence_city_level?: number;
    match_type?: string;
  };
}

interface GeoapifyResponse {
  results?: GeoapifyResult[];
}

interface StructuredAddress {
  street: string;
  housenumber: string;
  city?: string;
  state?: string;
  country?: string;
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
    const structuredAddress = parseStructuredAddress(address);

    if (structuredAddress) {
      url.searchParams.set('street', structuredAddress.street);
      url.searchParams.set('housenumber', structuredAddress.housenumber);

      if (structuredAddress.city) {
        url.searchParams.set('city', removeDiacritics(structuredAddress.city));
      }

      if (structuredAddress.state) {
        url.searchParams.set(
          'state',
          removeDiacritics(structuredAddress.state),
        );
      }

      if (structuredAddress.country) {
        url.searchParams.set('country', structuredAddress.country);
      }
    } else {
      // Direcciones heredadas, rurales o especiales no siempre tienen la
      // nomenclatura urbana necesaria para separar calle y numero de predio.
      url.searchParams.set('text', address);
    }

    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '5');
    url.searchParams.set('filter', 'countrycode:co');
    url.searchParams.set('apiKey', apiKey);

    const data = await this.fetchGeoapify(url);

    const results = data.results ?? [];

    const exactCandidates = uniqueLocations(
      results.filter((result) => {
        const matchType = result.rank?.match_type;

        return (
          hasValidCoordinates(result) &&
          result.country_code?.toLowerCase() === 'co' &&
          result.result_type === 'building' &&
          Boolean(result.housenumber?.trim()) &&
          (matchType === 'full_match' || matchType === 'match_by_building') &&
          (result.rank?.confidence_building_level ?? 0) >= 0.8 &&
          (!structuredAddress ||
            matchesBuildingAddress(result, structuredAddress))
        );
      }),
    );

    if (exactCandidates.length === 1) {
      const result = exactCandidates[0];

      return {
        latitude: result.lat!,
        longitude: result.lon!,
        formattedAddress: result.formatted ?? address,
      };
    }

    let streetResults: GeoapifyResult[] = [];
    let streetCandidates: GeoapifyResult[] = [];

    if (
      structuredAddress?.city &&
      structuredAddress.state &&
      structuredAddress.country
    ) {
      const streetUrl = new URL(url);
      streetUrl.searchParams.delete('housenumber');
      streetUrl.searchParams.set('type', 'street');
      const streetData = await this.fetchGeoapify(streetUrl);
      streetResults = streetData.results ?? [];

      streetCandidates = uniqueLocations(
        streetResults.filter(
          (result) =>
            hasValidCoordinates(result) &&
            result.result_type === 'street' &&
            (result.rank?.confidence_street_level ?? 0) >= 0.8 &&
            (result.rank?.match_type === 'full_match' ||
              result.rank?.match_type === 'match_by_street') &&
            matchesStreetAddress(result, structuredAddress),
        ),
      );

      if (streetCandidates.length === 1) {
        const result = streetCandidates[0];

        return {
          latitude: result.lat!,
          longitude: result.lon!,
          formattedAddress: address,
        };
      }
    }

    if (
      structuredAddress?.city &&
      structuredAddress.state &&
      structuredAddress.country &&
      (exactCandidates.length > 1 || streetCandidates.length > 1)
    ) {
      const cityUrl = new URL(url);
      cityUrl.searchParams.delete('street');
      cityUrl.searchParams.delete('housenumber');
      cityUrl.searchParams.set(
        'city',
        removeDiacritics(structuredAddress.city),
      );
      cityUrl.searchParams.set(
        'state',
        removeDiacritics(structuredAddress.state),
      );
      cityUrl.searchParams.set('type', 'city');
      const cityData = await this.fetchGeoapify(cityUrl);
      const cityCandidates = uniqueLocations(
        (cityData.results ?? []).filter(
          (result) =>
            hasValidCoordinates(result) &&
            result.result_type === 'city' &&
            (result.rank?.confidence_city_level ?? 0) >= 0.8 &&
            result.rank?.match_type === 'full_match' &&
            matchesCityAddress(result, structuredAddress),
        ),
      );

      if (cityCandidates.length === 1) {
        const result = cityCandidates[0];

        return {
          latitude: result.lat!,
          longitude: result.lon!,
          formattedAddress: address,
        };
      }

      throw new ValidationError(
        'No se pudo determinar una ubicación única para la ciudad indicada. Verifica la dirección o agrega un barrio o código postal.',
        'GEOCODING_AMBIGUOUS',
      );
    }

    if (exactCandidates.length > 1 || streetCandidates.length > 1) {
      throw new ValidationError(
        'No se pudo determinar una ubicación aproximada única para esta dirección. Verifica la calle y la zona.',
        'GEOCODING_AMBIGUOUS',
      );
    }

    if (results.length === 0 && streetResults.length === 0) {
      throw new ValidationError(
        'No se encontró una ubicación para la dirección ingresada.',
        'GEOCODING_NOT_FOUND',
      );
    }

    throw new ValidationError(
      'Se encontró la zona, pero no fue posible confirmar el inmueble con suficiente precisión.',
      'GEOCODING_BUILDING_UNCONFIRMED',
    );
  }

  private async fetchGeoapify(url: URL): Promise<GeoapifyResponse> {
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

    try {
      return (await response.json()) as GeoapifyResponse;
    } catch {
      throw new ValidationError(
        'El servicio de ubicación devolvió una respuesta inválida.',
        'GEOCODING_FAILED',
      );
    }
  }
}

function hasValidCoordinates(result: GeoapifyResult): boolean {
  return (
    Number.isFinite(result.lat) &&
    Number.isFinite(result.lon) &&
    result.lat! >= -90 &&
    result.lat! <= 90 &&
    result.lon! >= -180 &&
    result.lon! <= 180
  );
}

function matchesBuildingAddress(
  result: GeoapifyResult,
  address: StructuredAddress,
): boolean {
  return (
    matchesStreetAddress(result, address) &&
    normalizeHouseNumber(result.housenumber) ===
      normalizeHouseNumber(address.housenumber)
  );
}

function matchesStreetAddress(
  result: GeoapifyResult,
  address: StructuredAddress,
): boolean {
  return (
    Boolean(address.city?.trim()) &&
    Boolean(address.state?.trim()) &&
    Boolean(address.country?.trim()) &&
    normalizeStreet(result.street) === normalizeStreet(address.street) &&
    normalizeAddressComponent(result.city) ===
      normalizeAddressComponent(address.city) &&
    normalizeAddressComponent(result.state) ===
      normalizeAddressComponent(address.state) &&
    normalizeAddressComponent(result.country) ===
      normalizeAddressComponent(address.country) &&
    result.country_code?.toLowerCase() === 'co'
  );
}

function matchesCityAddress(
  result: GeoapifyResult,
  address: StructuredAddress,
): boolean {
  return (
    Boolean(address.city?.trim()) &&
    Boolean(address.state?.trim()) &&
    Boolean(address.country?.trim()) &&
    normalizeAddressComponent(result.city) ===
      normalizeAddressComponent(address.city) &&
    normalizeAddressComponent(result.state) ===
      normalizeAddressComponent(address.state) &&
    normalizeAddressComponent(result.country) ===
      normalizeAddressComponent(address.country) &&
    result.country_code?.toLowerCase() === 'co'
  );
}

function normalizeAddressComponent(value?: string): string {
  return (
    value
      ?.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase() ?? ''
  );
}

function normalizeHouseNumber(value?: string): string {
  return normalizeAddressComponent(value).replace(/\s*-\s*|\s+/g, '-');
}

function normalizeStreet(value?: string): string {
  const normalized = normalizeAddressComponent(value);
  const roadTypeAliases: Array<[RegExp, string]> = [
    [/^(?:kr|kra|cra)\.?\s+/, 'carrera '],
    [/^(?:cl|cll)\.?\s+/, 'calle '],
  ];

  for (const [alias, canonical] of roadTypeAliases) {
    if (alias.test(normalized)) {
      return normalized.replace(alias, canonical);
    }
  }

  return normalized;
}

function removeDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function uniqueLocations(results: GeoapifyResult[]): GeoapifyResult[] {
  const seenCoordinates = new Set<string>();

  return results.filter((result) => {
    const coordinates = `${result.lat},${result.lon}`;
    if (seenCoordinates.has(coordinates)) return false;
    seenCoordinates.add(coordinates);
    return true;
  });
}

const COLOMBIAN_DEPARTMENTS = new Set(
  [
    'Amazonas',
    'Antioquia',
    'Arauca',
    'Atlántico',
    'Bolívar',
    'Boyacá',
    'Caldas',
    'Caquetá',
    'Casanare',
    'Cauca',
    'Cesar',
    'Chocó',
    'Córdoba',
    'Cundinamarca',
    'Guainía',
    'Guaviare',
    'Huila',
    'La Guajira',
    'Magdalena',
    'Meta',
    'Nariño',
    'Norte de Santander',
    'Putumayo',
    'Quindío',
    'Risaralda',
    'San Andrés y Providencia',
    'Santander',
    'Sucre',
    'Tolima',
    'Valle del Cauca',
    'Vaupés',
    'Vichada',
  ].map(normalizeAddressComponent),
);

/**
 * El formulario de sedes conserva la dirección como texto, pero la genera con
 * esta nomenclatura: "Carrera 10 # 5 - 12, Medellín, Antioquia, Colombia".
 * Cuando la reconoce, aprovechamos la consulta estructurada de Geoapify. Las
 * direcciones que no siguen ese formato conservan la búsqueda libre.
 */
function parseStructuredAddress(address: string): StructuredAddress | null {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const firstPart = parts[0];

  if (!firstPart) return null;

  const match = firstPart.match(
    /^(?<roadType>.+?)\s+(?<roadNumber>\d+[A-Za-z]?)\s*#\s*(?<propertyNumber>\d+\s*-\s*\d+)$/,
  );

  if (!match?.groups) return null;

  const components = parts.slice(1);
  if (components.length < 3) return null;

  const country = components.at(-1);
  const state = components.at(-2);
  const city = components.at(-3);

  if (
    !country ||
    normalizeAddressComponent(country) !== 'colombia' ||
    !state ||
    !COLOMBIAN_DEPARTMENTS.has(normalizeAddressComponent(state)) ||
    !city ||
    isAddressDetail(city)
  ) {
    return null;
  }

  return {
    street: match.groups.roadType.trim() + ' ' + match.groups.roadNumber.trim(),
    housenumber: match.groups.propertyNumber.replace(/\s+/g, ''),
    city,
    state,
    country: 'Colombia',
  };
}

function isAddressDetail(value: string): boolean {
  return /^(barrio|vereda|comuna|localidad|sector|corregimiento|urbanizaci[oó]n|conjunto|local|unidad|torre|apartamento|piso|manzana)\b/i.test(
    value.trim(),
  );
}

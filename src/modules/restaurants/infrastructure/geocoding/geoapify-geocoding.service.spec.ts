import { ConfigService } from '@nestjs/config';
import { ValidationError } from '../../../../common/errors/validation-error';
import { GeoapifyGeocodingService } from './geoapify-geocoding.service';

const address = 'Carrera 10 # 5 - 12, Medellín, Antioquia, Colombia';

const validBuilding = {
  lat: 6.2442,
  lon: -75.5812,
  formatted: 'Carrera 10 # 5-12, Medellín, Antioquia, Colombia',
  street: 'Kr 10',
  housenumber: '5 12',
  city: 'MEDELLIN',
  state: 'Antioquia',
  country: 'Colombia',
  country_code: 'co',
  result_type: 'building',
  rank: {
    confidence_building_level: 0.9,
    match_type: 'full_match',
  },
};

const validStreet = {
  lat: 6.2442,
  lon: -75.5812,
  formatted: 'Carrera 10, Medellín, Antioquia, Colombia',
  street: 'Carrera 10',
  city: 'Medellín',
  state: 'Antioquia',
  country: 'Colombia',
  country_code: 'co',
  result_type: 'street',
  rank: {
    confidence_street_level: 0.9,
    match_type: 'full_match',
  },
};

const validCity = {
  lat: 6.2443382,
  lon: -75.573553,
  city: 'Medellín',
  state: 'Antioquia',
  country: 'Colombia',
  country_code: 'co',
  result_type: 'city',
  rank: {
    confidence_city_level: 1,
    match_type: 'full_match',
  },
};

const validBuildingWithoutConfidence = {
  ...validBuilding,
  rank: { ...validBuilding.rank, confidence_building_level: 0.79 },
};

describe('GeoapifyGeocodingService', () => {
  let service: GeoapifyGeocodingService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    service = new GeoapifyGeocodingService({
      get: jest.fn().mockReturnValue('test-api-key'),
    } as unknown as ConfigService);
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('acepta formatos equivalentes de calle, número, ciudad y departamento', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [validBuilding] }));

    await expect(service.geocode(address)).resolves.toEqual({
      latitude: 6.2442,
      longitude: -75.5812,
      formattedAddress: validBuilding.formatted,
    });

    const request = fetchMock.mock.calls[0][0];
    expect(request).toBeInstanceOf(URL);
    if (!(request instanceof URL)) {
      throw new Error('Expected Geoapify request to use a URL instance.');
    }
    const requestUrl = request;
    expect(requestUrl.searchParams.get('street')).toBe('Carrera 10');
    expect(requestUrl.searchParams.get('housenumber')).toBe('5-12');
    expect(requestUrl.searchParams.get('city')).toBe('Medellin');
    expect(requestUrl.searchParams.get('state')).toBe('Antioquia');
    expect(requestUrl.searchParams.get('country')).toBe('Colombia');
    expect(requestUrl.searchParams.get('text')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('identifica ciudad y departamento aunque haya un barrio adicional', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [validBuilding] }));

    await service.geocode(
      'Carrera 10 # 5 - 12, Barrio Laureles, Medellín, Antioquia, Colombia',
    );

    const request = fetchMock.mock.calls[0][0];
    expect(request).toBeInstanceOf(URL);
    if (!(request instanceof URL)) {
      throw new Error('Expected Geoapify request to use a URL instance.');
    }
    expect(request.searchParams.get('city')).toBe('Medellin');
    expect(request.searchParams.get('state')).toBe('Antioquia');
    expect(request.searchParams.get('country')).toBe('Colombia');
  });

  it.each([
    'Carrera 10 # 5 - 12, Barrio Laureles, Medellín, Colombia',
    'Carrera 10 # 5 - 12, Medellín, Antioquia',
    'Carrera 10 # 5 - 12, Barrio Laureles, Antioquia, Colombia',
  ])(
    'usa búsqueda libre cuando los componentes administrativos están incompletos: %s',
    async (incompleteAddress) => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [] }));

      await expect(service.geocode(incompleteAddress)).rejects.toMatchObject<
        Partial<ValidationError>
      >({
        code: 'GEOCODING_NOT_FOUND',
      });

      const request = fetchMock.mock.calls[0][0];
      expect(request).toBeInstanceOf(URL);
      if (!(request instanceof URL)) {
        throw new Error('Expected Geoapify request to use a URL instance.');
      }
      expect(request.searchParams.get('text')).toBe(incompleteAddress);
      expect(request.searchParams.get('street')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('rechaza varios inmuebles válidos como ambiguos', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [validBuilding, { ...validBuilding, lon: -75.5813 }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));

    await expect(service.geocode(address)).rejects.toMatchObject<
      Partial<ValidationError>
    >({
      code: 'GEOCODING_AMBIGUOUS',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['street', { street: 'Carrera 11' }],
    ['housenumber', { housenumber: '6-12' }],
    ['city', { city: 'Bogotá' }],
    ['department', { state: 'Cundinamarca' }],
    ['country', { country: 'Ecuador', country_code: 'ec' }],
  ])(
    'no acepta un inmueble como exacto si no coincide %s',
    async (_, mismatch) => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ results: [{ ...validBuilding, ...mismatch }] }),
        )
        .mockResolvedValueOnce(jsonResponse({ results: [] }));

      await expect(service.geocode(address)).rejects.toMatchObject<
        Partial<ValidationError>
      >({
        code: 'GEOCODING_BUILDING_UNCONFIRMED',
      });
    },
  );

  it('acepta una única calle compatible y conserva la dirección completa', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ results: [validBuildingWithoutConfidence] }),
      )
      .mockResolvedValueOnce(jsonResponse({ results: [validStreet] }));

    await expect(service.geocode(address)).resolves.toEqual({
      latitude: 6.2442,
      longitude: -75.5812,
      formattedAddress: address,
    });

    const streetRequest = fetchMock.mock.calls[1][0];
    expect(streetRequest).toBeInstanceOf(URL);
    if (!(streetRequest instanceof URL)) {
      throw new Error('Expected street search to use a URL instance.');
    }
    const streetRequestUrl = streetRequest;
    expect(streetRequestUrl.searchParams.get('type')).toBe('street');
    expect(streetRequestUrl.searchParams.get('housenumber')).toBeNull();
  });

  it('usa una ubicación de ciudad única cuando varias calles compatibles son ambiguas', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            validStreet,
            { ...validStreet, lat: 6.25, lon: -75.59, postcode: '050013' },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ results: [validCity] }));

    await expect(service.geocode(address)).resolves.toEqual({
      latitude: validCity.lat,
      longitude: validCity.lon,
      formattedAddress: address,
    });

    const cityRequest = fetchMock.mock.calls[2][0];
    expect(cityRequest).toBeInstanceOf(URL);
    if (!(cityRequest instanceof URL)) {
      throw new Error('Expected city fallback to use a URL instance.');
    }
    expect(cityRequest.searchParams.get('type')).toBe('city');
    expect(cityRequest.searchParams.get('street')).toBeNull();
    expect(cityRequest.searchParams.get('housenumber')).toBeNull();
  });

  it('rechaza si las calles y la ciudad siguen sin una ubicación única', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            validStreet,
            { ...validStreet, lat: 6.25, lon: -75.59, postcode: '050013' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [validCity, { ...validCity, lat: 6.3, lon: -75.6 }],
        }),
      );

    await expect(service.geocode(address)).rejects.toMatchObject<
      Partial<ValidationError>
    >({
      code: 'GEOCODING_AMBIGUOUS',
    });
  });

  it('no acepta el fallback de ciudad si Geoapify devuelve otra ciudad', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            validStreet,
            { ...validStreet, lat: 6.25, lon: -75.59, postcode: '050013' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              ...validCity,
              city: 'Bogotá',
              state: 'Cundinamarca',
            },
          ],
        }),
      );

    await expect(service.geocode(address)).rejects.toMatchObject<
      Partial<ValidationError>
    >({
      code: 'GEOCODING_AMBIGUOUS',
    });
  });

  it.each([
    ['street', { street: 'Carrera 11' }],
    ['city', { city: 'Bogotá' }],
    ['department', { state: 'Cundinamarca' }],
    ['country', { country: 'Ecuador', country_code: 'ec' }],
  ])(
    'rechaza una calle aproximada cuya %s no coincide',
    async (_, mismatch) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ results: [] }))
        .mockResolvedValueOnce(
          jsonResponse({ results: [{ ...validStreet, ...mismatch }] }),
        );

      await expect(service.geocode(address)).rejects.toMatchObject<
        Partial<ValidationError>
      >({
        code: 'GEOCODING_BUILDING_UNCONFIRMED',
      });
    },
  );

  it.each(['street', 'city', 'state', 'country'])(
    'rechaza una calle aproximada si falta el componente %s',
    async (component) => {
      const missingComponent: Record<string, unknown> = { ...validStreet };
      delete missingComponent[component];
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ results: [] }))
        .mockResolvedValueOnce(jsonResponse({ results: [missingComponent] }));

      await expect(service.geocode(address)).rejects.toMatchObject<
        Partial<ValidationError>
      >({
        code: 'GEOCODING_BUILDING_UNCONFIRMED',
      });
    },
  );

  it.each([
    ['non-finite', { lat: Number.NaN }],
    ['out-of-range', { lon: -181 }],
  ])(
    'rechaza coordenadas %s para la aproximación',
    async (_, invalidCoords) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ results: [] }))
        .mockResolvedValueOnce(
          jsonResponse({ results: [{ ...validStreet, ...invalidCoords }] }),
        );

      await expect(service.geocode(address)).rejects.toMatchObject<
        Partial<ValidationError>
      >({
        code: 'GEOCODING_BUILDING_UNCONFIRMED',
      });
    },
  );

  it('no utiliza una calle con confianza insuficiente', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              ...validStreet,
              rank: { confidence_street_level: 0.79, match_type: 'full_match' },
            },
          ],
        }),
      );

    await expect(service.geocode(address)).rejects.toMatchObject<
      Partial<ValidationError>
    >({
      code: 'GEOCODING_BUILDING_UNCONFIRMED',
    });
  });

  it('reporta una dirección sin resultados como no encontrada', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));

    await expect(service.geocode(address)).rejects.toMatchObject<
      Partial<ValidationError>
    >({
      code: 'GEOCODING_NOT_FOUND',
    });
  });

  it('rechaza resultados de edificio y calle de otra ciudad', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              ...validBuilding,
              city: 'Bogotá',
              state: 'Cundinamarca',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              ...validStreet,
              city: 'Bogotá',
              state: 'Cundinamarca',
            },
          ],
        }),
      );

    await expect(service.geocode(address)).rejects.toMatchObject<
      Partial<ValidationError>
    >({
      code: 'GEOCODING_BUILDING_UNCONFIRMED',
    });
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

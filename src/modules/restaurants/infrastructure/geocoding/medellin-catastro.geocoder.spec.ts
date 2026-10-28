import { ValidationError } from '../../../../common/errors/validation-error';
import {
  MedellinCatastroGeocoder,
  esDireccionDeMedellin,
  parsearNomenclatura,
  puntoSobreLinea,
} from './medellin-catastro.geocoder';

const respuesta = (features: unknown[]): Response =>
  ({
    ok: true,
    json: jest.fn().mockResolvedValue({ features }),
  }) as unknown as Response;

const where = (call: unknown[]): string =>
  (call[0] as URL).searchParams.get('where') ?? '';

describe('parsearNomenclatura', () => {
  const m = ', Medellín, Antioquia, Colombia';
  it.each([
    ['Carrera 82C # 29 - 11', ['CR'], '82C', null, '29', null, 11],
    ['Calle 10 # 43C - 36', ['CL'], '10', null, '43C', null, 36],
    ['Avenida Carrera 80 # 32D - 05', ['CR'], '80', null, '32D', null, 5],
    ['Avenida 37 # 45 - 76', ['CL', 'CR'], '37', null, '45', null, 76],
    ['Calle 51 Sur # 62E - 16', ['CL'], '51', 'SUR', '62E', null, 16],
    ['Carrera 34 # 18AA Sur - 160', ['CR'], '34', null, '18AA', 'SUR', 160],
    ['Carrera 34 Este # 14A - 24', ['CR'], '34', 'ESTE', '14A', null, 24],
    ['Carrera 10C # 44AA - 60A', ['CR'], '10C', null, '44AA', null, 60],
    ['Calle 10 # 43 - 36 Sur', ['CL'], '10', null, '43', 'SUR', 36],
    ['Calle 44 Norte # 70 Oeste - 20', ['CL'], '44', null, '70', null, 20],
    ['cra 87 #21-12', ['CR'], '87', null, '21', null, 12],
  ])(
    'interpreta %s',
    (via, tiposVia, numeroVia, cuadranteVia, cruce, cuadranteCruce, placa) => {
      expect(parsearNomenclatura(`${via}${m}`)).toEqual({
        tiposVia,
        numeroVia,
        cuadranteVia,
        cruce,
        cuadranteCruce,
        placa,
      });
    },
  );

  it('ignora direcciones sin nomenclatura urbana', () => {
    expect(parsearNomenclatura(`Vereda El Plan${m}`)).toBeNull();
  });
});

describe('esDireccionDeMedellin', () => {
  it('reconoce la ciudad aunque haya barrio', () => {
    expect(
      esDireccionDeMedellin(
        'Carrera 82C # 29 - 11, Barrio La Palma, Medellín, Antioquia, Colombia',
      ),
    ).toBe(true);
    expect(
      esDireccionDeMedellin(
        'Carrera 7 # 72 - 10, Bogotá, Bogotá D.C., Colombia',
      ),
    ).toBe(false);
    expect(esDireccionDeMedellin('Calle 5 #45-98')).toBe(false);
  });
});

describe('puntoSobreLinea', () => {
  it('avanza los metros indicados desde el inicio del eje', () => {
    // ~111 m hacia el norte
    const [lon, lat] = puntoSobreLinea(
      [
        [-75.6, 6.23],
        [-75.6, 6.231],
      ],
      55.6,
    );
    expect(lon).toBeCloseTo(-75.6, 6);
    expect(lat).toBeCloseTo(6.2305, 4);
  });

  it('se queda en el final si la placa supera el largo de la cuadra', () => {
    expect(
      puntoSobreLinea(
        [
          [-75.6, 6.23],
          [-75.6, 6.231],
        ],
        500,
      ),
    ).toEqual([-75.6, 6.231]);
  });
});

describe('MedellinCatastroGeocoder', () => {
  const address = 'Carrera 82C # 29 - 11, Medellín, Antioquia, Colombia';
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const geocoder = new MedellinCatastroGeocoder();

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('usa la placa oficial exacta', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta([
        {
          attributes: { direccion: 'CR 82C 29-11', via: 'CR 82C' },
          geometry: { x: -75.6051, y: 6.23026 },
        },
      ]),
    );

    await expect(geocoder.geocode(address)).resolves.toEqual({
      latitude: 6.23026,
      longitude: -75.6051,
      precision: 'placa',
      direccionOficial: 'CR 82C 29-11',
    });
    expect(where(fetchMock.mock.calls[0])).toBe(
      "via IN ('CR 82C') AND (placa = '29-11' OR placa LIKE '29-11 (%')",
    );
  });

  it('usa la placa más cercana de la misma cuadra si la exacta no existe', async () => {
    fetchMock.mockResolvedValueOnce(respuesta([])).mockResolvedValueOnce(
      respuesta([
        {
          attributes: {
            direccion: 'CR 82C 29-03',
            via: 'CR 82C',
            placa: '29-03',
          },
          geometry: { x: -75.6, y: 6.1 },
        },
        {
          attributes: {
            direccion: 'CR 82C 29-15',
            via: 'CR 82C',
            placa: '29-15',
          },
          geometry: { x: -75.7, y: 6.2 },
        },
        {
          attributes: {
            direccion: 'CR 82C 29 SUR-11',
            via: 'CR 82C',
            placa: '29 SUR-11',
          },
          geometry: { x: -75.8, y: 6.3 },
        },
      ]),
    );

    await expect(geocoder.geocode(address)).resolves.toMatchObject({
      latitude: 6.2,
      longitude: -75.7,
      precision: 'cuadra',
    });
  });

  it('avanza sobre el eje de la cuadra si no hay placas registradas', async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta([]))
      .mockResolvedValueOnce(respuesta([]))
      .mockResolvedValueOnce(
        respuesta([
          {
            attributes: { label: 'CR 82C' },
            geometry: {
              paths: [
                [
                  [-75.6, 6.23],
                  [-75.6, 6.231],
                ],
              ],
            },
          },
        ]),
      );

    const resultado = await geocoder.geocode(address);
    expect(resultado?.precision).toBe('eje');
    expect(resultado?.latitude).toBeCloseTo(6.2301, 4);
    expect(where(fetchMock.mock.calls[2])).toContain("name IN ('82C-29'");
  });

  it('busca con los cuadrantes de la vía y del cruce', async () => {
    fetchMock.mockResolvedValue(respuesta([]));

    await geocoder.geocode(
      'Calle 51 Sur # 18AA Sur - 160, Medellín, Antioquia, Colombia',
    );

    expect(where(fetchMock.mock.calls[0])).toBe(
      "via IN ('CL 51 SUR') AND (placa = '18AA SUR-160' OR placa LIKE '18AA SUR-160 (%')",
    );
    expect(where(fetchMock.mock.calls[1])).toBe(
      "via IN ('CL 51 SUR') AND placa LIKE '18AA SUR-%'",
    );
    expect(where(fetchMock.mock.calls[2])).toContain("orientacion_cruce = 'S'");
  });

  it('devuelve null si la dirección no existe en la nomenclatura', async () => {
    fetchMock.mockResolvedValue(respuesta([]));
    await expect(geocoder.geocode(address)).resolves.toBeNull();
  });

  it('rechaza una avenida que existe como calle y como carrera', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta([
        {
          attributes: { direccion: 'CL 37 45-76', via: 'CL 37' },
          geometry: { x: -75.5, y: 6.2 },
        },
        {
          attributes: { direccion: 'CR 37 45-76', via: 'CR 37' },
          geometry: { x: -75.6, y: 6.3 },
        },
      ]),
    );

    await expect(
      geocoder.geocode('Avenida 37 # 45 - 76, Medellín, Antioquia, Colombia'),
    ).rejects.toMatchObject<Partial<ValidationError>>({
      code: 'GEOCODING_AMBIGUOUS',
    });
  });

  it('informa si el servicio de la Alcaldía no responde', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(geocoder.geocode(address)).rejects.toMatchObject<
      Partial<ValidationError>
    >({
      code: 'GEOCODING_FAILED',
    });
  });
});

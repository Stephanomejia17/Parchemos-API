import { ValidationError } from '../../../../common/errors/validation-error';
import { AddressGeocodingService } from './address-geocoding.service';
import type { MedellinCatastroGeocoder } from './medellin-catastro.geocoder';

function setup() {
  const catastro = {
    geocode: jest.fn(),
    cuadrasParecidas: jest.fn().mockResolvedValue([]),
  };
  const service = new AddressGeocodingService(
    catastro as unknown as MedellinCatastroGeocoder,
  );
  return { service, catastro };
}

describe('AddressGeocodingService', () => {
  it('ubica las direcciones de Medellín con el catastro oficial', async () => {
    const { service, catastro } = setup();
    catastro.geocode.mockResolvedValue({
      latitude: 6.23026,
      longitude: -75.6051,
      precision: 'placa',
      direccionOficial: 'CR 82C 29-11',
    });
    const address = 'Carrera 82C # 29 - 11, Medellín, Antioquia, Colombia';

    await expect(service.geocode(address)).resolves.toEqual({
      latitude: 6.23026,
      longitude: -75.6051,
      formattedAddress: address,
    });
  });

  it('rechaza una dirección de Medellín que no existe en la nomenclatura', async () => {
    const { service, catastro } = setup();
    catastro.geocode.mockResolvedValue(null);

    await expect(
      service.geocode('Carrera 79A # 39 - 72, Medellín, Antioquia, Colombia'),
    ).rejects.toMatchObject<Partial<ValidationError>>({
      code: 'GEOCODING_NOT_FOUND',
    });
  });

  it('sugiere las cuadras reales cuando la del cruce no existe', async () => {
    const { service, catastro } = setup();
    catastro.geocode.mockResolvedValue(null);
    catastro.cuadrasParecidas.mockResolvedValue(['32D', '32E', '32EE']);

    const error = await service
      .geocode('Carrera 80 # 32 - 05, Medellín, Antioquia, Colombia')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe('GEOCODING_NOT_FOUND');
    expect((error as ValidationError).message).toContain('32D, 32E, 32EE');
  });

  it('rechaza sedes fuera de Medellín sin consultar el catastro', async () => {
    const { service, catastro } = setup();

    const error = await service
      .geocode('Carrera 50 # 51 - 100, BELLO, ANTIOQUIA, Colombia')
      .catch((e: unknown) => e);

    expect((error as ValidationError).code).toBe('GEOCODING_CITY_UNSUPPORTED');
    expect(catastro.geocode).not.toHaveBeenCalled();
  });
});

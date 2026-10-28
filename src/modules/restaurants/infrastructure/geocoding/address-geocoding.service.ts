import { Injectable } from '@nestjs/common';
import { ValidationError } from '../../../../common/errors/validation-error';
import {
  MedellinCatastroGeocoder,
  esDireccionDeMedellin,
} from './medellin-catastro.geocoder';

export interface GeocodedAddress {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

/**
 * Punto de entrada para ubicar una sede. Solo se guardan ubicaciones
 * verificadas, nunca aproximadas. Por ahora solo hay fuente precisa y
 * gratuita para Medellin (nomenclatura oficial de la Alcaldia): las demas
 * ciudades se rechazan hasta tener una fuente equivalente.
 */
@Injectable()
export class AddressGeocodingService {
  constructor(private readonly catastroMedellin: MedellinCatastroGeocoder) {}

  async geocode(address: string): Promise<GeocodedAddress> {
    if (!esDireccionDeMedellin(address)) {
      throw new ValidationError(
        'Por ahora solo aceptamos sedes en Medellín. Indica una dirección urbana de Medellín, Antioquia.',
        'GEOCODING_CITY_UNSUPPORTED',
      );
    }

    const resultado = await this.catastroMedellin.geocode(address);
    if (!resultado) {
      const cuadras = await this.catastroMedellin
        .cuadrasParecidas(address)
        .catch(() => []);
      throw new ValidationError(
        cuadras.length
          ? `Esa cuadra no existe en la nomenclatura oficial de Medellín. En esa vía existen: ${cuadras.join(', ')}. Revisa el número después del #.`
          : 'No encontramos esta dirección en la nomenclatura oficial de Medellín. Revisa el tipo de vía, los números y las letras (por ejemplo "Calle 10 # 43C - 36").',
        'GEOCODING_NOT_FOUND',
        cuadras.length ? { sugerencias: cuadras } : undefined,
      );
    }

    return {
      latitude: resultado.latitude,
      longitude: resultado.longitude,
      formattedAddress: address,
    };
  }
}

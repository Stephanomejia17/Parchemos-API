import { Mesa } from '../../domain/entities/mesa.entity';
import type { MesaPublicUrlBuilder } from '../../domain/services/mesa-qr';

export function toMesaResponse(mesa: Mesa, urls: MesaPublicUrlBuilder) {
  return {
    id: mesa.id,
    code: mesa.code,
    capacity: mesa.capacity,
    status: mesa.status,
    qrUrl: urls.build(mesa.id),
    qrImageUrl: `/api/mesas/${mesa.id}/qr`,
  };
}


import { TableStatus as PrismaTableStatus } from '../../../../../generated/prisma/client';
import { Mesa } from '../../domain/entities/mesa.entity';
import { MesaStatus } from '../../domain/enums/mesa-status.enum';

export interface MesaPersistenceRow {
  id: string;
  locationId: string;
  code: string;
  capacity: number;
  status: PrismaTableStatus;
  qrToken: string;
}

export function toMesaDomain(row: MesaPersistenceRow): Mesa {
  return new Mesa({
    id: row.id,
    locationId: row.locationId,
    code: row.code,
    capacity: row.capacity,
    status: row.status as MesaStatus,
    qrToken: row.qrToken,
  });
}

import { Mesa } from '../entities/mesa.entity';
import { MesaStatus } from '../enums/mesa-status.enum';

export const MESA_REPOSITORY = Symbol('MESA_REPOSITORY');

export interface CreateMesaData {
  locationId: string;
  code: string;
  capacity: number;
}

export interface UpdateMesaData {
  status?: MesaStatus;
  code?: string;
  capacity?: number;
}

export interface PublicMesaDetails {
  mesa: Mesa;
  restaurantId: string;
  restaurantName: string;
}

export interface MesaRepository {
  locationBelongsToOwner(locationId: string, ownerId: string): Promise<boolean>;
  listByLocation(locationId: string): Promise<Mesa[]>;
  create(data: CreateMesaData): Promise<Mesa>;
  findOwnedById(tableId: string, ownerId: string): Promise<Mesa | null>;
  updateStatus(tableId: string, status: MesaStatus): Promise<Mesa>;
  update(tableId: string, data: UpdateMesaData): Promise<Mesa>;
  findPublicById(tableId: string): Promise<PublicMesaDetails | null>;
  findById(tableId: string): Promise<Mesa | null>;
}

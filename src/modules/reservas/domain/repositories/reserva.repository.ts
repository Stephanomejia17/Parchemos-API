import { Reserva } from '../entities/reserva.entity';

export const RESERVA_REPOSITORY = Symbol('RESERVA_REPOSITORY');

export interface ReservaRepository {
  findById(id: string): Promise<Reserva | null>;
  findByRestauranteId(restauranteId: string): Promise<Reserva[]>;
  save(reserva: Reserva): Promise<Reserva>;
}

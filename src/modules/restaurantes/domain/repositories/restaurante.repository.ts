import { Restaurante } from '../entities/restaurante.entity';

export const RESTAURANTE_REPOSITORY = Symbol('RESTAURANTE_REPOSITORY');

export interface RestauranteRepository {
  findById(id: string): Promise<Restaurante | null>;
  findByPropietarioId(propietarioId: string): Promise<Restaurante[]>;
  save(restaurante: Restaurante): Promise<Restaurante>;
}

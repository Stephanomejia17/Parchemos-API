import { Resena } from '../entities/resena.entity';

export const RESENA_REPOSITORY = Symbol('RESENA_REPOSITORY');

export interface ResenaRepository {
  findById(id: string): Promise<Resena | null>;
  findByRestauranteId(restauranteId: string): Promise<Resena[]>;
  save(resena: Resena): Promise<Resena>;
}

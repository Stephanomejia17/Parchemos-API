import { Inject, Injectable } from '@nestjs/common';
import { LOCATION_REPOSITORY } from '../../domain/repositories/location.repository';
import type { LocationRepository } from '../../domain/repositories/location.repository';

export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_RESULTS = 10;

/** Autocompletado del selector de restaurante (DO-04). */
@Injectable()
export class SearchLocationsUseCase {
  constructor(
    @Inject(LOCATION_REPOSITORY)
    private readonly locations: LocationRepository,
  ) {}

  async execute(query: string) {
    const text = query.trim();
    // Con menos de 2 caracteres no se consulta la BD: lista vacia.
    if (text.length < MIN_SEARCH_LENGTH) return [];
    return this.locations.searchActiveByName(text, MAX_SEARCH_RESULTS);
  }
}

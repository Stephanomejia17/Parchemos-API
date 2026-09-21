import { Inject, Injectable } from '@nestjs/common';

import {
  LOCATION_REVIEW_REPOSITORY,
} from '../../domain/repositories/location-review.repository';
import type {
  LocationReviewRepository,
} from '../../domain/repositories/location-review.repository';

@Injectable()
export class ListLocationReviewsUseCase {
  constructor(
    @Inject(LOCATION_REVIEW_REPOSITORY)
    private readonly reviews: LocationReviewRepository,
  ) {}

  async execute(locationId: string) {
    return this.reviews.findPublishedByLocation(locationId);
  }
}
import { Inject, Injectable } from '@nestjs/common';

import { LOCATION_REVIEW_REPOSITORY } from '../../domain/repositories/location-review.repository';
import type { LocationReviewRepository } from '../../domain/repositories/location-review.repository';

import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { ValidationError } from '../../../../common/errors/validation-error';

@Injectable()
export class CreateOrUpdateLocationReviewUseCase {
  constructor(
    @Inject(LOCATION_REVIEW_REPOSITORY)
    private readonly reviews: LocationReviewRepository,
  ) {}

  async execute(
    locationId: string,
    userId: string,
    rating: number,
    comment: string | null,
  ) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new ValidationError(
        'La calificación debe estar entre 1 y 5 estrellas.',
        'INVALID_RATING',
      );
    }

    const hasReservation = await this.reviews.hasCompletedReservation(
      locationId,
      userId,
    );

    const hasOrder = await this.reviews.hasDeliveredOrder(
      locationId,
      userId,
    );

    if (!hasReservation && !hasOrder) {
      throw new ForbiddenError(
        'Debes haber interactuado con el restaurante para poder calificarlo.',
        'REVIEW_NOT_ELIGIBLE',
      );
    }

    const normalizedComment =
      comment === null ? null : comment.trim();

    if (rating < 3 && !normalizedComment) {
      throw new ValidationError(
        'Debes ingresar un comentario para una calificación menor a 3 estrellas.',
        'COMMENT_REQUIRED',
      );
    }

    if (normalizedComment !== null) {
      if (normalizedComment.length < 10) {
        throw new ValidationError(
          'El comentario debe tener al menos 10 caracteres.',
          'COMMENT_TOO_SHORT',
        );
      }

      if (normalizedComment.length > 500) {
        throw new ValidationError(
          'El comentario no puede superar los 500 caracteres.',
          'COMMENT_TOO_LONG',
        );
      }
    }

    return this.reviews.upsert(
      locationId,
      userId,
      rating,
      normalizedComment,
    );
  }
}
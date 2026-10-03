import { Inject, Injectable } from '@nestjs/common';

import { LOCATION_REVIEW_REPOSITORY } from '../../domain/repositories/location-review.repository';
import type { LocationReviewRepository } from '../../domain/repositories/location-review.repository';

import { ForbiddenError } from '../../../../common/errors/forbidden-error';
import { ValidationError } from '../../../../common/errors/validation-error';

@Injectable()
export class UpdateLocationReviewUseCase {
  constructor(
    @Inject(LOCATION_REVIEW_REPOSITORY)
    private readonly reviews: LocationReviewRepository,
  ) {}

  async execute(
    reviewId: string,
    userId: string,
    rating: number | undefined,
    comment: string | null | undefined,
  ) {
    const review = await this.reviews.findById(reviewId);

    if (!review) {
      throw new ValidationError(
        'La calificación no existe.',
        'REVIEW_NOT_FOUND',
      );
    }

    if (review.userId !== userId) {
      throw new ForbiddenError(
        'Solo puedes editar tu propia reseña.',
        'REVIEW_NOT_OWNED',
      );
    }

    const nextRating = rating ?? review.rating;
    if (!Number.isInteger(nextRating) || nextRating < 1 || nextRating > 5) {
      throw new ValidationError(
        'La calificaciÃ³n debe estar entre 1 y 5 estrellas.',
        'INVALID_RATING',
      );
    }

    const normalizedComment = comment?.trim() || null;

    if (nextRating < 3 && !normalizedComment) {
      throw new ValidationError(
        'Debes ingresar un comentario para una calificaciÃ³n menor a 3 estrellas.',
        'COMMENT_REQUIRED',
      );
    }

    if (normalizedComment !== null && normalizedComment.length < 10) {
      throw new ValidationError(
        'El comentario debe tener al menos 10 caracteres.',
        'COMMENT_TOO_SHORT',
      );
    }

    if (normalizedComment !== null && normalizedComment.length > 500) {
      throw new ValidationError(
        'El comentario no puede superar los 500 caracteres.',
        'COMMENT_TOO_LONG',
      );
    }

    return this.reviews.updateComment(reviewId, nextRating, normalizedComment);
  }
}

import { Inject, Injectable } from '@nestjs/common';

import {
  LOCATION_REVIEW_REPOSITORY,
} from '../../domain/repositories/location-review.repository';
import type {
  LocationReviewRepository,
} from '../../domain/repositories/location-review.repository';

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
    comment: string,
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

    const normalizedComment = comment.trim();

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

    return this.reviews.updateComment(reviewId, normalizedComment);
  }
}
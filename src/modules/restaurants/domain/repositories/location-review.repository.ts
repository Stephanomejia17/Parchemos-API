export const LOCATION_REVIEW_REPOSITORY = Symbol(
  'LOCATION_REVIEW_REPOSITORY',
);

export interface LocationReviewData {
  id: string;
  locationId: string;
  userId: string;
  rating: number;
  comment: string | null;
  status: string;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocationReviewRepository {
  findByLocationAndUser(
    locationId: string,
    userId: string,
  ): Promise<LocationReviewData | null>;

  findById(id: string): Promise<LocationReviewData | null>;

  findPublishedByLocation(
    locationId: string,
  ): Promise<LocationReviewData[]>;

  hasCompletedReservation(
    locationId: string,
    userId: string,
  ): Promise<boolean>;

  hasDeliveredOrder(
    locationId: string,
    userId: string,
  ): Promise<boolean>;

  upsert(
    locationId: string,
    userId: string,
    rating: number,
    comment: string | null,
  ): Promise<LocationReviewData>;

  updateComment(
    reviewId: string,
    comment: string,
  ): Promise<LocationReviewData>;
}
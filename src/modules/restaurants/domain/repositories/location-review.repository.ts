export const LOCATION_REVIEW_REPOSITORY = Symbol('LOCATION_REVIEW_REPOSITORY');

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
  /** Datos mínimos y públicos del autor; nunca incluye su correo. */
  author?: {
    fullName: string;
    photoUrl: string | null;
  };
}

export interface LocationReviewSummary {
  average: number;
  total: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface LocationReviewListData {
  reviews: LocationReviewData[];
  summary: LocationReviewSummary;
}

export interface LocationReviewRepository {
  findByLocationAndUser(
    locationId: string,
    userId: string,
  ): Promise<LocationReviewData | null>;

  findById(id: string): Promise<LocationReviewData | null>;

  findPublishedByLocation(locationId: string): Promise<LocationReviewListData>;

  hasCompletedReservation(locationId: string, userId: string): Promise<boolean>;

  hasPlacedOrder(locationId: string, userId: string): Promise<boolean>;

  upsert(
    locationId: string,
    userId: string,
    rating: number,
    comment: string | null,
  ): Promise<LocationReviewData>;

  updateComment(
    reviewId: string,
    rating: number,
    comment: string | null,
  ): Promise<LocationReviewData>;
}

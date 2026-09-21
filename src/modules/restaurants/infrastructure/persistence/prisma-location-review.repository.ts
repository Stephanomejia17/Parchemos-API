import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

import {
  LocationReviewData,
  LocationReviewRepository,
} from '../../domain/repositories/location-review.repository';

@Injectable()
export class PrismaLocationReviewRepository
  implements LocationReviewRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async findByLocationAndUser(
    locationId: string,
    userId: string,
  ): Promise<LocationReviewData | null> {
    return this.prisma.locationReview.findUnique({
      where: {
        locationId_userId: {
          locationId,
          userId,
        },
      },
    });
  }

  async findById(id: string): Promise<LocationReviewData | null> {
    return this.prisma.locationReview.findUnique({
      where: { id },
    });
  }

  async findPublishedByLocation(
    locationId: string,
  ): Promise<LocationReviewData[]> {
    return this.prisma.locationReview.findMany({
      where: {
        locationId,
        status: 'publicada',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async hasCompletedReservation(
    locationId: string,
    userId: string,
  ): Promise<boolean> {
    const reservation = await this.prisma.reservation.findFirst({
      where: {
        locationId,
        dinerId: userId,
        status: 'completada',
      },
      select: { id: true },
    });

    return reservation !== null;
  }

  async hasDeliveredOrder(
    locationId: string,
    userId: string,
  ): Promise<boolean> {
    const order = await this.prisma.order.findFirst({
      where: {
        locationId,
        dinerId: userId,
        status: 'entregado',
      },
      select: { id: true },
    });

    return order !== null;
  }

  async upsert(
    locationId: string,
    userId: string,
    rating: number,
    comment: string | null,
  ): Promise<LocationReviewData> {
    return this.prisma.locationReview.upsert({
      where: {
        locationId_userId: {
          locationId,
          userId,
        },
      },
      create: {
        locationId,
        userId,
        rating,
        comment,
      },
      update: {
        rating,
        comment,
      },
    });
  }

  async updateComment(
    reviewId: string,
    comment: string,
  ): Promise<LocationReviewData> {
    return this.prisma.locationReview.update({
      where: {
        id: reviewId,
      },
      data: {
        comment,
      },
    });
  }
}
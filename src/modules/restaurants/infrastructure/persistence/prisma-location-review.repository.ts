import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

import {
  LocationReviewData,
  LocationReviewListData,
  LocationReviewRepository,
} from '../../domain/repositories/location-review.repository';

@Injectable()
export class PrismaLocationReviewRepository implements LocationReviewRepository {
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
  ): Promise<LocationReviewListData> {
    const reviews = await this.prisma.locationReview.findMany({
      where: {
        locationId,
        status: 'publicada',
      },
      // La reseña es pública, pero solo devolvemos nombre y foto del perfil.
      // El correo y el resto de datos personales nunca forman parte de esta respuesta.
      include: {
        user: {
          select: {
            profile: { select: { fullName: true, photoUrl: true } },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const mappedReviews = reviews.map(({ user, ...review }) => ({
      ...review,
      author: {
        fullName: user.profile?.fullName || 'Usuario',
        photoUrl: user.profile?.photoUrl ?? null,
      },
    }));
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<
      1 | 2 | 3 | 4 | 5,
      number
    >;
    const total = mappedReviews.length;
    const ratingTotal = mappedReviews.reduce((sum, review) => {
      distribution[review.rating as 1 | 2 | 3 | 4 | 5] += 1;
      return sum + review.rating;
    }, 0);

    return {
      reviews: mappedReviews,
      // Estos valores corresponden exclusivamente a reseñas publicadas.
      summary: {
        average: total ? Number((ratingTotal / total).toFixed(2)) : 0,
        total,
        distribution,
      },
    };
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

  async hasPlacedOrder(locationId: string, userId: string): Promise<boolean> {
    const order = await this.prisma.order.findFirst({
      where: {
        locationId,
        dinerId: userId,
        // Los pedidos creados en esta versión quedan en "pendiente" y aún
        // no existe un flujo para avanzar su estado hasta "entregado".
        // Cuenta el pedido enviado; no habilita borradores ni cancelados.
        status: { notIn: ['borrador', 'cancelado'] },
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
        // En un upsert existente también debe quedar constancia de la edición.
        editedAt: new Date(),
      },
    });
  }

  async updateComment(
    reviewId: string,
    rating: number,
    comment: string | null,
  ): Promise<LocationReviewData> {
    return this.prisma.locationReview.update({
      where: {
        id: reviewId,
      },
      data: {
        rating,
        comment,
        // Se conserva createdAt para ordenar por publicación y se marca por
        // separado cuándo el autor modificó una reseña ya publicada.
        editedAt: new Date(),
      },
    });
  }
}

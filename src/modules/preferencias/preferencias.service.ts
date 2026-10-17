import { Injectable } from '@nestjs/common';
import { ValidationError } from '../../common/errors/validation-error';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface TastePreferences {
  cuisines: { id: string; slug: string; name: string }[];
  selectedCuisineIds: string[];
  priceRangeMin: number | null;
  priceRangeMax: number | null;
}

export interface SaveTastePreferences {
  cuisineIds: string[];
  priceRangeMin: number | null;
  priceRangeMax: number | null;
}

/**
 * PU-03 (PARCHE-350): gustos del comensal que alimentan las recomendaciones.
 * Escribe en `user_cuisine_preferences` y `user_preferences`.
 */
@Injectable()
export class PreferenciasService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<TastePreferences> {
    const [cuisines, selected, preferences] = await Promise.all([
      this.prisma.cuisineType.findMany({
        where: { isActive: true },
        select: { id: true, slug: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.userCuisinePreference.findMany({
        where: { userId },
        select: { cuisineTypeId: true },
      }),
      this.prisma.userPreference.findUnique({ where: { userId } }),
    ]);
    return {
      cuisines,
      selectedCuisineIds: selected.map((row) => row.cuisineTypeId),
      priceRangeMin: preferences?.priceRangeMin ?? null,
      priceRangeMax: preferences?.priceRangeMax ?? null,
    };
  }

  async save(userId: string, input: SaveTastePreferences): Promise<void> {
    const cuisineIds = [...new Set(input.cuisineIds)];
    const { priceRangeMin, priceRangeMax } = input;

    // La BD exige que el rango venga completo o vacio (user_preferences_price_range_chk).
    if ((priceRangeMin === null) !== (priceRangeMax === null)) {
      throw new ValidationError(
        'Indica el precio mínimo y el máximo, o ninguno de los dos.',
      );
    }
    if (
      priceRangeMin !== null &&
      priceRangeMax !== null &&
      priceRangeMin > priceRangeMax
    ) {
      throw new ValidationError(
        'El precio mínimo no puede ser mayor que el máximo.',
      );
    }

    if (cuisineIds.length) {
      const valid = await this.prisma.cuisineType.count({
        where: { id: { in: cuisineIds }, isActive: true },
      });
      if (valid !== cuisineIds.length) {
        throw new ValidationError('Algún tipo de cocina no es válido.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.userCuisinePreference.deleteMany({ where: { userId } }),
      this.prisma.userCuisinePreference.createMany({
        data: cuisineIds.map((cuisineTypeId) => ({ userId, cuisineTypeId })),
      }),
      this.prisma.userPreference.upsert({
        where: { userId },
        create: { userId, priceRangeMin, priceRangeMax },
        update: { priceRangeMin, priceRangeMax, updatedAt: new Date() },
      }),
    ]);
  }
}

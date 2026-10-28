import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client';
import type { AiInsight } from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import type {
  Insight,
  InsightContent,
  InsightScope,
} from '../../domain/insight';
import type {
  EstadoInsightDelDia,
  InsightRepository,
  ReservaInsight,
} from '../../domain/insight.repository';

/** Las columnas date llegan como medianoche UTC. */
const comoFecha = (valor: string): Date => new Date(`${valor}T00:00:00Z`);
const aTexto = (valor: Date): string => valor.toISOString().slice(0, 10);

const esClaveDuplicada = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

function aInsight(fila: AiInsight): Insight {
  return {
    id: fila.id,
    scope: fila.scope,
    fecha: aTexto(fila.insightDate),
    rango: { desde: aTexto(fila.rangeFrom), hasta: aTexto(fila.rangeTo) },
    restauranteId: fila.restaurantId,
    contenido: fila.content as unknown as InsightContent,
    modelo: fila.model ?? '',
    generadoEn: fila.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaInsightRepository implements InsightRepository {
  constructor(private readonly prisma: PrismaService) {}

  async delDia(
    userId: string,
    scope: InsightScope,
    fecha: string,
  ): Promise<EstadoInsightDelDia> {
    const fila = await this.prisma.aiInsight.findUnique({
      where: {
        userId_scope_insightDate: {
          userId,
          scope,
          insightDate: comoFecha(fecha),
        },
      },
    });
    if (!fila) return { insight: null, generandoDesde: null };
    return fila.status === 'listo'
      ? { insight: aInsight(fila), generandoDesde: null }
      : { insight: null, generandoDesde: fila.createdAt };
  }

  async reservar(reserva: ReservaInsight): Promise<string | null> {
    try {
      const fila = await this.prisma.aiInsight.create({
        data: {
          userId: reserva.userId,
          scope: reserva.scope,
          insightDate: comoFecha(reserva.fecha),
          rangeFrom: comoFecha(reserva.rango.desde),
          rangeTo: comoFecha(reserva.rango.hasta),
          restaurantId: reserva.restauranteId,
        },
        select: { id: true },
      });
      return fila.id;
    } catch (error) {
      if (esClaveDuplicada(error)) return null;
      throw error;
    }
  }

  async liberarSiEstancada(
    userId: string,
    scope: InsightScope,
    fecha: string,
    iniciadaAntesDe: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.aiInsight.deleteMany({
      where: {
        userId,
        scope,
        insightDate: comoFecha(fecha),
        status: 'generando',
        createdAt: { lt: iniciadaAntesDe },
      },
    });
    return count > 0;
  }

  async completar(
    id: string,
    contenido: InsightContent,
    modelo: string,
  ): Promise<Insight> {
    const fila = await this.prisma.aiInsight.update({
      where: { id },
      data: {
        status: 'listo',
        content: contenido as unknown as Prisma.InputJsonValue,
        model: modelo,
        updatedAt: new Date(),
      },
    });
    return aInsight(fila);
  }

  async liberar(id: string): Promise<void> {
    await this.prisma.aiInsight.deleteMany({
      where: { id, status: 'generando' },
    });
  }
}

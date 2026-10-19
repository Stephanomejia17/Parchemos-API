import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import type { RangoFechas } from '../../domain/rango-fechas';
import type {
  ContenidoDestacado,
  EstadisticasRepository,
  FilaAfiliado,
  FiltroAfiliados,
  PuntoUso,
  PuntoVentas,
  ResumenRestaurante,
  TendenciasUso,
} from '../../domain/repositories/estadisticas.repository';

const redondear = (n: number): number => Math.round(n * 100) / 100;

/**
 * Consultas agregadas en SQL crudo. Los importes salen como float8: son
 * Decimal(12,2), caben sin pérdida en un double y evitan serializar Decimal.
 * Los días se calculan en hora de Colombia, no en UTC.
 */
@Injectable()
export class PrismaEstadisticasRepository implements EstadisticasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async restauranteEsDe(
    restauranteId: string,
    duenoId: string,
  ): Promise<boolean> {
    const fila = await this.prisma.restaurant.findFirst({
      where: { id: restauranteId, ownerId: duenoId },
      select: { id: true },
    });
    return fila !== null;
  }

  async resumenRestaurante(
    duenoId: string,
    rango: RangoFechas,
    restauranteId?: string,
  ): Promise<ResumenRestaurante> {
    const restaurante = restauranteId ?? null;
    // Muestra pedidos reales aunque el proceso que crea commissions no los haya generado todavía.
    const filas = await this.prisma.$queryRaw<
      { fecha: string; bruto: number; comision: number; pedidos: number }[]
    >`
      with dias as (
        select generate_series(${rango.desde}::date, ${rango.hasta}::date, interval '1 day')::date as dia
      ), ventas as (
        select (coalesce(c.created_at, o.placed_at, o.created_at) at time zone 'America/Bogota')::date as dia,
               sum(coalesce(c.gross_amount, o.total)) as bruto,
               sum(coalesce(c.commission_amount, round(o.total * r.commission_rate, 2))) as comision,
               count(distinct o.id) as pedidos
        from public.orders o
        join public.restaurants r on r.id = o.restaurant_id
        left join public.commissions c on c.order_id = o.id
        where r.owner_id = ${duenoId}::uuid
          and (${restaurante}::uuid is null or r.id = ${restaurante}::uuid)
          and o.status <> 'cancelado'
          and coalesce(c.created_at, o.placed_at, o.created_at) >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and coalesce(c.created_at, o.placed_at, o.created_at) < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
        group by 1
      )
      select to_char(d.dia, 'YYYY-MM-DD') as fecha,
             coalesce(v.bruto, 0)::float8 as bruto,
             coalesce(v.comision, 0)::float8 as comision,
             coalesce(v.pedidos, 0)::int as pedidos
      from dias d
      left join ventas v on v.dia = d.dia
      order by d.dia`;

    const serie: PuntoVentas[] = filas.map((f) => ({
      fecha: f.fecha,
      ingresosBrutos: redondear(f.bruto),
      comision: redondear(f.comision),
      pedidos: f.pedidos,
    }));
    // Los totales salen de la serie: tarjetas y gráfico no pueden discrepar.
    const totales = serie.reduce(
      (acc, p) => ({
        ingresosBrutos: acc.ingresosBrutos + p.ingresosBrutos,
        comisionTotal: acc.comisionTotal + p.comision,
        pedidos: acc.pedidos + p.pedidos,
      }),
      { ingresosBrutos: 0, comisionTotal: 0, pedidos: 0 },
    );
    return {
      totales: {
        ingresosBrutos: redondear(totales.ingresosBrutos),
        comisionTotal: redondear(totales.comisionTotal),
        pedidos: totales.pedidos,
      },
      serie,
    };
  }

  async ingresosAfiliados(
    rango: RangoFechas,
    filtro: FiltroAfiliados,
  ): Promise<FilaAfiliado[]> {
    const tipo = filtro.tipo ?? null;
    const afiliado = filtro.afiliadoId ?? null;
    return this.prisma.$queryRaw<FilaAfiliado[]>`
      select * from (
        select 'restaurante'::text as "tipo",
               r.id::text as "afiliadoId",
               r.business_name as "nombre",
               sum(coalesce(c.gross_amount, o.total))::float8 as "montoBruto",
               sum(coalesce(c.commission_amount, round(o.total * r.commission_rate, 2)))::float8 as "comisionOPago",
               count(distinct o.id)::int as "pedidos"
        from public.orders o
        join public.restaurants r on r.id = o.restaurant_id
        left join public.commissions c on c.order_id = o.id
        where (${tipo}::text is null or ${tipo}::text = 'restaurante')
          and (${afiliado}::uuid is null or r.id = ${afiliado}::uuid)
          and o.status <> 'cancelado'
          and coalesce(c.created_at, o.placed_at, o.created_at) >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and coalesce(c.created_at, o.placed_at, o.created_at) < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
        group by r.id, r.business_name
        union all
        select 'repartidor'::text,
               u.id::text,
               coalesce(p.full_name, u.email::text),
               null::float8,
               sum(c.courier_payout)::float8,
               count(*)::int
        from public.commissions c
        join public.users u on u.id = c.courier_id
        left join public.user_profiles p on p.user_id = u.id
        join public.orders o on o.id = c.order_id
        where c.courier_id is not null
          and (${tipo}::text is null or ${tipo}::text = 'repartidor')
          and (${afiliado}::uuid is null or u.id = ${afiliado}::uuid)
          and c.created_at >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and c.created_at < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
        group by u.id, p.full_name, u.email
      ) t
      order by t."comisionOPago" desc`;
  }

  async tendencias(
    rango: RangoFechas,
    restauranteId?: string,
  ): Promise<TendenciasUso> {
    const restaurante = restauranteId ?? null;
    const serie = await this.prisma.$queryRaw<PuntoUso[]>`
      with dias as (
        select generate_series(${rango.desde}::date, ${rango.hasta}::date, interval '1 day')::date as dia
      ), act as (
        select (issued_at at time zone 'America/Bogota')::date as dia, user_id
        from public.sessions
        where ${restaurante}::uuid is null
          and issued_at >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and issued_at < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
        union all
        select (last_used_at at time zone 'America/Bogota')::date, user_id
        from public.sessions
        where ${restaurante}::uuid is null and last_used_at is not null
          and last_used_at >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and last_used_at < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
        union all
        select (last_login_at at time zone 'America/Bogota')::date, id
        from public.users
        where ${restaurante}::uuid is null and last_login_at is not null
          and last_login_at >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and last_login_at < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
        union all
        select (coalesce(o.placed_at, o.created_at) at time zone 'America/Bogota')::date,
               coalesce(o.diner_id, o.created_by_staff_id)
        from public.orders o
        where ${restaurante}::uuid is not null
          and o.restaurant_id = ${restaurante}::uuid
          and coalesce(o.placed_at, o.created_at) >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and coalesce(o.placed_at, o.created_at) < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
          and coalesce(o.diner_id, o.created_by_staff_id) is not null
        union all
        select (pl.created_at at time zone 'America/Bogota')::date, pl.user_id
        from public.post_likes pl
        join public.posts p on p.id = pl.post_id and p.status = 'publicada'
        join public.locations loc on loc.id = p.location_id
        where ${restaurante}::uuid is not null
          and loc.restaurant_id = ${restaurante}::uuid
          and pl.created_at >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and pl.created_at < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
        union all
        select (p.created_at at time zone 'America/Bogota')::date, p.author_id
        from public.posts p
        join public.locations loc on loc.id = p.location_id
        where ${restaurante}::uuid is not null
          and loc.restaurant_id = ${restaurante}::uuid
          and p.status = 'publicada'
          and p.created_at >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and p.created_at < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
      ), activos as (select dia, count(distinct user_id) as n from act group by dia),
      usuariosNuevos as (
        select (u.created_at at time zone 'America/Bogota')::date as dia,
               count(distinct u.id) as n
        from public.users u
        where u.created_at >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and u.created_at < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
          and (${restaurante}::uuid is null or exists (
            select 1 from act where act.user_id = u.id
          ))
        group by 1
      ), pubs as (
        select (p.created_at at time zone 'America/Bogota')::date as dia, count(*) as n
        from public.posts p
        left join public.locations loc on loc.id = p.location_id
        where p.status = 'publicada'
          and (${restaurante}::uuid is null or loc.restaurant_id = ${restaurante}::uuid)
          and p.created_at >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and p.created_at < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
        group by 1
      ), lks as (
        select (pl.created_at at time zone 'America/Bogota')::date as dia, count(*) as n
        from public.post_likes pl
        join public.posts p on p.id = pl.post_id and p.status = 'publicada'
        left join public.locations loc on loc.id = p.location_id
        where (${restaurante}::uuid is null or loc.restaurant_id = ${restaurante}::uuid)
          and pl.created_at >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and pl.created_at < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
        group by 1
      )
      select to_char(d.dia, 'YYYY-MM-DD') as "fecha",
             coalesce(a.n, 0)::int as "usuariosActivos",
             coalesce(nu.n, 0)::int as "usuariosNuevos",
             coalesce(p.n, 0)::int as "publicaciones",
             coalesce(l.n, 0)::int as "likes"
      from dias d
      left join activos a on a.dia = d.dia
      left join usuariosNuevos nu on nu.dia = d.dia
      left join pubs p on p.dia = d.dia
      left join lks l on l.dia = d.dia
      order by d.dia`;

    const [viewsState] = await this.prisma.$queryRaw<{ disponible: boolean }[]>`
      select to_regclass('public.post_views') is not null as disponible`;
    const viewCount = viewsState?.disponible
      ? Prisma.sql`count(distinct pv.id)::int`
      : Prisma.sql`0::int`;
    const viewJoin = viewsState?.disponible
      ? Prisma.sql`left join public.post_views pv on pv.post_id = p.id
          and pv.viewed_at >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
          and pv.viewed_at < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'`
      : Prisma.empty;

    // Una vista se registra como máximo una vez por usuario/publicación/día.
    const topContenido = await this.prisma.$queryRaw<ContenidoDestacado[]>`
      select p.id::text as "postId",
             left(coalesce(p.caption, ''), 80) as "descripcion",
             coalesce(up.full_name, u.email::text) as "autor",
             l.name as "sede",
             count(distinct pl.user_id)::int as "likes",
             ${viewCount} as "visualizaciones",
             (select count(*) from public.post_media pm
               where pm.post_id = p.id and pm.media_type = 'imagen')::int as "imagenes",
             (select count(*) from public.post_media pm
               where pm.post_id = p.id and pm.media_type = 'video')::int as "videos"
      from public.posts p
      join public.users u on u.id = p.author_id
      left join public.user_profiles up on up.user_id = u.id
      left join public.locations l on l.id = p.location_id
      left join public.post_likes pl on pl.post_id = p.id
        and pl.created_at >= (${rango.desde}::date)::timestamp at time zone 'America/Bogota'
        and pl.created_at < (${rango.hasta}::date + 1)::timestamp at time zone 'America/Bogota'
      ${viewJoin}
      where p.status = 'publicada'
        and (${restaurante}::uuid is null or l.restaurant_id = ${restaurante}::uuid)
      group by p.id, p.caption, up.full_name, u.email, l.name
      order by 6 desc, 5 desc, p.created_at desc
      limit 10`;

    return { serie, topContenido };
  }
}

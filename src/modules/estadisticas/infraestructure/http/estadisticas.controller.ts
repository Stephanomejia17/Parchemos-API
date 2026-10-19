import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { EstadisticasService } from '../../application/estadisticas.service';
import { generarReporteRestaurante } from '../reports/reporte-restaurante';
import {
  AfiliadosQueryDto,
  ReporteRestauranteQueryDto,
  ResumenRestauranteQueryDto,
  TendenciasQueryDto,
} from '../../application/dto/estadisticas.dto';

/** CA13: cada vista solo para su rol (403 si no corresponde, lo aplica RolesGuard). */
@Controller('estadisticas')
export class EstadisticasController {
  constructor(private readonly estadisticas: EstadisticasService) {}

  // ---- Restaurante (AE-01) ----

  @Get('restaurante/resumen')
  @Roles(Role.RESTAURANTE)
  async resumenRestaurante(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ResumenRestauranteQueryDto,
  ) {
    return {
      success: true,
      data: await this.estadisticas.resumenRestaurante(user, q),
      message: 'Estadísticas consultadas correctamente.',
    };
  }

  @Get('restaurante/reporte')
  @Roles(Role.RESTAURANTE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async reporteRestaurante(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ReporteRestauranteQueryDto,
  ): Promise<StreamableFile> {
    const datos = await this.estadisticas.datosParaReporte(user, q);
    const archivo = await generarReporteRestaurante(datos, q.formato);
    return new StreamableFile(archivo.buffer, {
      type: archivo.contentType,
      disposition: `attachment; filename="${archivo.nombre}"`,
    });
  }

  // ---- Administrador (AE-02 y AE-03) ----

  @Get('admin/afiliados')
  @Roles(Role.ADMINISTRADOR)
  async ingresosAfiliados(@Query() q: AfiliadosQueryDto) {
    return {
      success: true,
      data: await this.estadisticas.ingresosAfiliados(q),
      message: 'Ingresos de afiliados consultados correctamente.',
    };
  }

  @Get('admin/tendencias')
  @Roles(Role.ADMINISTRADOR)
  async tendencias(@Query() q: TendenciasQueryDto) {
    return {
      success: true,
      data: await this.estadisticas.tendencias(q.desde, q.hasta, q.restauranteId),
      message: 'Tendencias consultadas correctamente.',
    };
  }
}

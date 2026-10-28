import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { InsightsService } from '../../application/insights.service';
import {
  InsightAdminDto,
  InsightRestauranteDto,
} from '../../application/dto/insights.dto';

/**
 * Insights de IA de los dashboards. GET consulta el insight de hoy (no
 * consume cupo); POST lo genera: una vez por usuario, dashboard y dia.
 */
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('restaurante/hoy')
  @Roles(Role.RESTAURANTE)
  async estadoRestaurante(@CurrentUser() user: AuthenticatedUser) {
    return {
      success: true,
      data: await this.insights.estado(user, 'restaurante'),
      message: 'Insight del día consultado correctamente.',
    };
  }

  @Post('restaurante')
  @Roles(Role.RESTAURANTE)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async generarRestaurante(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InsightRestauranteDto,
  ) {
    return {
      success: true,
      data: await this.insights.generarRestaurante(user, dto),
      message: 'Insight generado correctamente.',
    };
  }

  @Get('admin/hoy')
  @Roles(Role.ADMINISTRADOR)
  async estadoAdmin(@CurrentUser() user: AuthenticatedUser) {
    return {
      success: true,
      data: await this.insights.estado(user, 'administrador'),
      message: 'Insight del día consultado correctamente.',
    };
  }

  @Post('admin')
  @Roles(Role.ADMINISTRADOR)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async generarAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InsightAdminDto,
  ) {
    return {
      success: true,
      data: await this.insights.generarAdministrador(user, dto),
      message: 'Insight generado correctamente.',
    };
  }
}

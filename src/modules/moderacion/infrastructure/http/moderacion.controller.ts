import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { ModeracionService } from '../../application/moderacion.service';
import { CreateReportDto, ModerationReasonDto, ModerationReportsQueryDto, ReviewReportDto } from './moderacion.dto';
import { ReportReason } from '../../../../../generated/prisma/client';

@Controller()
export class ModeracionController {
  constructor(private readonly moderation: ModeracionService) {}

  @Post('publicaciones/:id/reportes')
  @Roles(Role.COMENSAL, Role.RESTAURANTE)
  reportPost(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateReportDto) {
    return this.moderation.reportPost(id, user.id, dto.reason as ReportReason, dto.details);
  }

  @Get('administracion/moderacion/publicaciones')
  @Roles(Role.ADMINISTRADOR)
  listReports(@Query() query: ModerationReportsQueryDto) { return this.moderation.listReportedPosts(query); }

  @Get('administracion/moderacion/resumen')
  @Roles(Role.ADMINISTRADOR)
  moderationSummary() { return this.moderation.getSummary(); }

  @Post('administracion/moderacion/denuncias/:id/revisar')
  @Roles(Role.ADMINISTRADOR)
  reviewReport(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewReportDto) {
    return this.moderation.reviewReport(id, user.id, dto.result);
  }

  @Post('administracion/moderacion/publicaciones/:id/eliminar')
  @Roles(Role.ADMINISTRADOR)
  removePost(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerationReasonDto) { return this.moderation.removePost(id, user.id, dto.reason); }

  @Get('administracion/usuarios')
  @Roles(Role.ADMINISTRADOR)
  listUsers() { return this.moderation.listUsers(); }

  @Patch('administracion/usuarios/:id/suspender')
  @Roles(Role.ADMINISTRADOR)
  suspendUser(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerationReasonDto) { return this.moderation.suspendUser(id, user.id, dto.reason); }

  @Patch('administracion/usuarios/:id/activar')
  @Roles(Role.ADMINISTRADOR)
  reactivateUser(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.moderation.reactivateUser(id, user.id); }
}

import {
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { NotificacionesService } from './notificaciones.service';

/** Sin @Roles: cualquier usuario autenticado consulta su propia bandeja. */
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  listar(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limite', new DefaultValuePipe(20), ParseIntPipe) limite: number,
  ) {
    return this.notificaciones.listar(
      user.id,
      Math.min(Math.max(limite, 1), 50),
    );
  }

  @Patch('leidas')
  @HttpCode(204)
  marcarTodasLeidas(@CurrentUser() user: AuthenticatedUser) {
    return this.notificaciones.marcarTodasLeidas(user.id);
  }

  @Patch(':id/leida')
  @HttpCode(204)
  marcarLeida(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificaciones.marcarLeida(user.id, id);
  }
}

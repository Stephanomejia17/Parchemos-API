import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { ConfirmarPedidoUseCase } from '../../application/use-cases/confirmar-pedido.use-case';
import { toPedidoEstadoResponse } from './pedido.presenter';

@Controller('pedidos')
export class PedidosController {
  constructor(private readonly confirmarPedido: ConfirmarPedidoUseCase) {}

  @Post(':id/confirmar')
  @Roles(Role.COMENSAL)
  @HttpCode(HttpStatus.OK)
  async confirmar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const pedido = await this.confirmarPedido.execute(id, user.id);
    return {
      success: true,
      data: toPedidoEstadoResponse(pedido),
      message: 'Pedido confirmado.',
    };
  }
}

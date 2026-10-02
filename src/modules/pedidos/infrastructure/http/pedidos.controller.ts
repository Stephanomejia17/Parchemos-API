import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { CreatePedidoDto } from '../../application/dto/create-pedido.dto';
import { PedidosService } from '../../application/pedidos.service';

@Controller('pedidos')
@Roles(Role.COMENSAL)
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePedidoDto,
  ) {
    return {
      success: true,
      data: await this.pedidos.create(
        user.id,
        dto.locationId,
        dto.items,
        dto.tableId,
      ),
      message: 'Pedido registrado correctamente.',
    };
  }

  @Get('mios')
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    return {
      success: true,
      data: await this.pedidos.listMine(user.id),
      message: 'Pedidos consultados correctamente.',
    };
  }
}

import { Body, Controller, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { PedidosService } from '../../application/pedidos.service';

class PedidoItemDto { @IsUUID() productId!: string; @IsInt() @Min(1) quantity!: number; }
class CreatePedidoDto { @IsUUID() mesaId!: string; @ValidateNested({ each: true }) @Type(() => PedidoItemDto) items!: PedidoItemDto[]; @IsOptional() @IsString() notes?: string; }

@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Post()
  @Roles(Role.COMENSAL)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePedidoDto) { return this.pedidos.createFromTable(user.id, dto.mesaId, dto.items, dto.notes); }
}

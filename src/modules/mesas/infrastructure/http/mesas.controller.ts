import { Body, Controller, Delete, Get, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IsEnum, IsInt, IsNotEmpty, IsPositive, IsString, IsUUID, Max, Min } from 'class-validator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Public } from '../../../../common/decorators/public.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { TableStatus } from '../../../../../generated/prisma/client';
import { MesasService } from '../../application/mesas.service';

class CreateMesaDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsInt() @IsPositive() @Max(50) capacity!: number;
}
class UpdateMesaDto { @IsEnum(TableStatus) status!: TableStatus; }

@Controller('mesas')
export class MesasController {
  constructor(private readonly mesas: MesasService) {}
  @Get('sede/:locationId') @Roles(Role.RESTAURANTE)
  list(@CurrentUser() user: AuthenticatedUser, @Param('locationId') locationId: string) { return this.mesas.list(user.id, locationId); }
  @Post('sede/:locationId') @Roles(Role.RESTAURANTE)
  create(@CurrentUser() user: AuthenticatedUser, @Param('locationId') locationId: string, @Body() dto: CreateMesaDto) { return this.mesas.create(user.id, locationId, dto.code, dto.capacity); }
  @Patch(':tableId') @Roles(Role.RESTAURANTE)
  update(@CurrentUser() user: AuthenticatedUser, @Param('tableId') tableId: string, @Body() dto: UpdateMesaDto) { return this.mesas.setStatus(user.id, tableId, dto.status); }
  @Delete(':tableId') @Roles(Role.RESTAURANTE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('tableId') tableId: string) { return this.mesas.setStatus(user.id, tableId, TableStatus.inactiva); }
  @Public() @Get(':tableId/qr')
  async qr(@Param('tableId') tableId: string, @Res() response: Response) { response.set({ 'Content-Type': 'image/png', 'Content-Disposition': `inline; filename="mesa-${tableId}.png"`, 'Cache-Control': 'no-store' }); response.send(await this.mesas.qrPng(tableId)); }
  @Public() @Get(':tableId/public') publicDetail(@Param('tableId') tableId: string) { return this.mesas.publicDetail(tableId); }
}

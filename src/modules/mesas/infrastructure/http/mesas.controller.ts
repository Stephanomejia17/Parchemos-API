import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Public } from '../../../../common/decorators/public.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { ChangeMesaStatusUseCase } from '../../application/use-cases/change-mesa-status.use-case';
import { CreateMesaUseCase } from '../../application/use-cases/create-mesa.use-case';
import { GenerateMesaQrUseCase } from '../../application/use-cases/generate-mesa-qr.use-case';
import { GetPublicMesaUseCase } from '../../application/use-cases/get-public-mesa.use-case';
import { ListMesasUseCase } from '../../application/use-cases/list-mesas.use-case';
import { MesaStatus } from '../../domain/enums/mesa-status.enum';
import { MESA_PUBLIC_URL_BUILDER } from '../../domain/services/mesa-qr';
import type { MesaPublicUrlBuilder } from '../../domain/services/mesa-qr';
import { CreateMesaDto } from './create-mesa.dto';
import { toMesaResponse } from './mesa.presenter';
import { UpdateMesaDto } from './update-mesa.dto';

@Controller('mesas')
export class MesasController {
  constructor(
    private readonly listMesas: ListMesasUseCase,
    private readonly createMesa: CreateMesaUseCase,
    private readonly changeMesaStatus: ChangeMesaStatusUseCase,
    private readonly getPublicMesa: GetPublicMesaUseCase,
    private readonly generateMesaQr: GenerateMesaQrUseCase,
    @Inject(MESA_PUBLIC_URL_BUILDER)
    private readonly urls: MesaPublicUrlBuilder,
  ) {}

  @Get('sede/:locationId')
  @Roles(Role.RESTAURANTE)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    const mesas = await this.listMesas.execute(user.id, locationId);
    return mesas.map((mesa) => toMesaResponse(mesa, this.urls));
  }

  @Post('sede/:locationId')
  @Roles(Role.RESTAURANTE)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateMesaDto,
  ) {
    const mesa = await this.createMesa.execute(user.id, locationId, dto);
    return toMesaResponse(mesa, this.urls);
  }

  @Patch(':tableId')
  @Roles(Role.RESTAURANTE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableId', ParseUUIDPipe) tableId: string,
    @Body() dto: UpdateMesaDto,
  ) {
    const mesa = await this.changeMesaStatus.execute(
      user.id,
      tableId,
      dto,
    );
    return toMesaResponse(mesa, this.urls);
  }

  @Delete(':tableId')
  @Roles(Role.RESTAURANTE)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableId', ParseUUIDPipe) tableId: string,
  ) {
    const mesa = await this.changeMesaStatus.execute(
      user.id,
      tableId,
      { status: MesaStatus.INACTIVA },
    );
    return toMesaResponse(mesa, this.urls);
  }

  @Public()
  @Get(':tableId/qr')
  async qr(
    @Param('tableId', ParseUUIDPipe) tableId: string,
    @Res() response: Response,
  ) {
    response.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="mesa-${tableId}.png"`,
      'Cache-Control': 'no-store',
    });
    response.send(await this.generateMesaQr.execute(tableId));
  }

  @Public()
  @Get(':tableId/public')
  publicDetail(@Param('tableId', ParseUUIDPipe) tableId: string) {
    return this.getPublicMesa.execute(tableId);
  }
}

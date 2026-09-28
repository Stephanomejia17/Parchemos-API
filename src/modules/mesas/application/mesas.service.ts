import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TableStatus } from '../../../../generated/prisma/client';
import QRCode from 'qrcode';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Injectable()
export class MesasService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async list(ownerId: string, locationId: string) {
    await this.assertOwnedLocation(ownerId, locationId);
    const tables = await this.prisma.diningTable.findMany({ where: { locationId }, orderBy: { code: 'asc' } });
    return tables.map((table) => this.present(table));
  }

  async create(ownerId: string, locationId: string, code: string, capacity: number) {
    await this.assertOwnedLocation(ownerId, locationId);
    try {
      const table = await this.prisma.diningTable.create({ data: { locationId, code: code.trim(), capacity } });
      return this.present(table);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Ya existe una mesa con ese código en la sede.');
      throw error;
    }
  }

  async setStatus(ownerId: string, tableId: string, status: TableStatus) {
    await this.getOwnedTable(ownerId, tableId);
    return this.present(await this.prisma.diningTable.update({ where: { id: tableId }, data: { status } }));
  }

  async publicDetail(tableId: string) {
    const table = await this.prisma.diningTable.findUnique({ where: { id: tableId }, include: { location: { include: { restaurant: true } } } });
    if (!table || table.status !== TableStatus.activa) throw new NotFoundException('La mesa no está disponible para recibir pedidos.');
    return { tableId: table.id, tableCode: table.code, capacity: table.capacity, locationId: table.locationId, restaurantId: table.location.restaurantId, restaurantName: table.location.restaurant.businessName };
  }

  async qrPng(tableId: string): Promise<Buffer> {
    const table = await this.prisma.diningTable.findUnique({ where: { id: tableId }, select: { id: true, status: true } });
    if (!table || table.status !== TableStatus.activa) throw new NotFoundException('El QR de esta mesa ya no es válido.');
    return QRCode.toBuffer(this.buildUrl(table.id), { type: 'png', width: 640, margin: 2, errorCorrectionLevel: 'H' });
  }

  private present(table: { id: string; code: string; capacity: number; status: TableStatus }) {
    return { id: table.id, code: table.code, capacity: table.capacity, status: table.status, qrUrl: this.buildUrl(table.id), qrImageUrl: `/api/mesas/${table.id}/qr` };
  }

  private buildUrl(tableId: string) {
    const base = this.config.get<string>('APP_URL', 'http://localhost:3000').replace(/\/$/, '');
    return `${base}/pedido?mesa=${encodeURIComponent(tableId)}`;
  }

  private async assertOwnedLocation(ownerId: string, locationId: string) {
    const location = await this.prisma.location.findFirst({ where: { id: locationId, restaurant: { ownerId } }, select: { id: true } });
    if (!location) throw new ForbiddenException('La sede no pertenece a tu restaurante.');
    return location;
  }

  private async getOwnedTable(ownerId: string, tableId: string) {
    const table = await this.prisma.diningTable.findFirst({ where: { id: tableId, location: { restaurant: { ownerId } } } });
    if (!table) throw new NotFoundException('La mesa no existe en tu restaurante.');
    return table;
  }
}

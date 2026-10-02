import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MesaPublicUrlBuilder as MesaPublicUrlBuilderPort } from '../../domain/services/mesa-qr';

@Injectable()
export class MesaPublicUrlBuilder implements MesaPublicUrlBuilderPort {
  constructor(private readonly config: ConfigService) {}

  build(tableId: string): string {
    const base = this.config
      .get<string>('APP_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    return `${base}/pedido?mesa=${encodeURIComponent(tableId)}`;
  }
}
  
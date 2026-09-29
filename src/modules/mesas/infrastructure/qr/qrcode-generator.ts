import { Injectable } from '@nestjs/common';
import QRCode from 'qrcode';
import type { MesaQrGenerator } from '../../domain/services/mesa-qr';

@Injectable()
export class QrCodeGenerator implements MesaQrGenerator {
  generatePng(url: string): Promise<Buffer> {
    return QRCode.toBuffer(url, {
      type: 'png',
      width: 640,
      margin: 2,
      errorCorrectionLevel: 'H',
    });
  }
}

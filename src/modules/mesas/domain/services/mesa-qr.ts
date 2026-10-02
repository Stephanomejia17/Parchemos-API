export const MESA_QR_GENERATOR = Symbol('MESA_QR_GENERATOR');
export const MESA_PUBLIC_URL_BUILDER = Symbol('MESA_PUBLIC_URL_BUILDER');

export interface MesaQrGenerator {
  generatePng(url: string): Promise<Buffer>;
}

export interface MesaPublicUrlBuilder {
  build(tableId: string): string;
}


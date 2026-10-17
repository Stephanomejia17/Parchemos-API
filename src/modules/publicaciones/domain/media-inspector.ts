/**
 * Inspeccion del contenido real de un archivo (PARCHE-85, PARCHE-89).
 *
 * El `Content-Type` y la extension los controla el cliente, asi que el tipo se
 * decide por los bytes (magic numbers). De paso se extraen los metadatos que
 * la tabla `post_media` exige: dimensiones de las imagenes y duracion de los
 * videos (el CHECK `post_media_duration_chk` la pide para todo mp4).
 */
export type InspectedMediaType = 'imagen' | 'video';

export interface InspectedMedia {
  mediaType: InspectedMediaType;
  mimeType: 'image/jpeg' | 'image/png' | 'image/heic' | 'video/mp4';
  extension: 'jpg' | 'png' | 'heic' | 'mp4';
  width: number | null;
  height: number | null;
  /** Segundos, redondeados hacia arriba. Solo videos. */
  durationSeconds: number | null;
}

export const MAX_POST_MEDIA_BYTES = 50 * 1024 * 1024;
export const MAX_POST_MEDIA_FILES = 10;
export const ALLOWED_FORMATS_LABEL = 'JPG, PNG, HEIC y MP4';

const HEIC_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'mif1',
  'msf1',
]);
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'dash',
  'M4V ',
  'f4v ',
]);

/** Devuelve los metadatos del archivo o `null` si no es un formato permitido. */
export function inspectMedia(buffer: Buffer): InspectedMedia | null {
  if (isJpeg(buffer)) {
    return {
      mediaType: 'imagen',
      mimeType: 'image/jpeg',
      extension: 'jpg',
      ...jpegSize(buffer),
      durationSeconds: null,
    };
  }
  if (isPng(buffer)) {
    return {
      mediaType: 'imagen',
      mimeType: 'image/png',
      extension: 'png',
      ...pngSize(buffer),
      durationSeconds: null,
    };
  }
  const brand = ftypBrand(buffer);
  if (brand && HEIC_BRANDS.has(brand)) {
    return {
      mediaType: 'imagen',
      mimeType: 'image/heic',
      extension: 'heic',
      width: null,
      height: null,
      durationSeconds: null,
    };
  }
  if (brand && MP4_BRANDS.has(brand)) {
    return {
      mediaType: 'video',
      mimeType: 'video/mp4',
      extension: 'mp4',
      width: null,
      height: null,
      durationSeconds: mp4Duration(buffer),
    };
  }
  return null;
}

function isJpeg(b: Buffer): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function isPng(b: Buffer): boolean {
  return (
    b.length > 24 &&
    b.readUInt32BE(0) === 0x89504e47 &&
    b.readUInt32BE(4) === 0x0d0a1a0a
  );
}

function pngSize(b: Buffer): { width: number; height: number } {
  // IHDR siempre es el primer chunk: ancho y alto en los bytes 16-23.
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpegSize(b: Buffer): { width: number | null; height: number | null } {
  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) return { width: null, height: null };
    const marker = b[offset + 1];
    // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC) contienen las dimensiones.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return {
        height: b.readUInt16BE(offset + 5),
        width: b.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + b.readUInt16BE(offset + 2);
  }
  return { width: null, height: null };
}

/** Marca de compatibilidad de un contenedor ISO-BMFF (`ftyp`), o `null`. */
function ftypBrand(b: Buffer): string | null {
  if (b.length < 12 || b.toString('latin1', 4, 8) !== 'ftyp') return null;
  return b.toString('latin1', 8, 12);
}

interface Box {
  type: string;
  start: number;
  headerSize: number;
  end: number;
}

function* boxes(b: Buffer, from: number, to: number): Generator<Box> {
  let offset = from;
  while (offset + 8 <= to) {
    let size = b.readUInt32BE(offset);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > to) return;
      size = Number(b.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = to - offset;
    }
    if (size < headerSize || offset + size > to) return;
    yield {
      type: b.toString('latin1', offset + 4, offset + 8),
      start: offset,
      headerSize,
      end: offset + size,
    };
    offset += size;
  }
}

/** Duracion en segundos leida del `mvhd` dentro de `moov`; `null` si no se puede. */
function mp4Duration(b: Buffer): number | null {
  for (const moov of boxes(b, 0, b.length)) {
    if (moov.type !== 'moov') continue;
    for (const box of boxes(b, moov.start + moov.headerSize, moov.end)) {
      if (box.type !== 'mvhd') continue;
      const body = box.start + box.headerSize;
      const version = b[body];
      const timescale =
        version === 1 ? b.readUInt32BE(body + 20) : b.readUInt32BE(body + 12);
      const duration =
        version === 1
          ? Number(b.readBigUInt64BE(body + 24))
          : b.readUInt32BE(body + 16);
      if (!timescale || !duration) return null;
      return Math.max(1, Math.ceil(duration / timescale));
    }
  }
  return null;
}

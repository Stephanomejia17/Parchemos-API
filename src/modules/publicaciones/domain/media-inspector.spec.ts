import { inspectMedia } from './media-inspector';

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'latin1');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpeg(width: number, height: number): Buffer {
  // SOI + APP0 (16 bytes) + SOF0 con las dimensiones.
  const app0 = Buffer.alloc(18);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

function box(type: string, body: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, body]);
}

function ftyp(brand: string): Buffer {
  const body = Buffer.alloc(8);
  body.write(brand, 0, 'latin1');
  return box('ftyp', body);
}

function mp4(timescale: number, duration: number): Buffer {
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(timescale, 12);
  mvhd.writeUInt32BE(duration, 16);
  return Buffer.concat([ftyp('isom'), box('moov', box('mvhd', mvhd))]);
}

describe('inspectMedia', () => {
  it('reconoce un PNG y lee sus dimensiones', () => {
    expect(inspectMedia(png(640, 480))).toMatchObject({
      mediaType: 'imagen',
      mimeType: 'image/png',
      width: 640,
      height: 480,
      durationSeconds: null,
    });
  });

  it('reconoce un JPEG y lee sus dimensiones', () => {
    expect(inspectMedia(jpeg(1200, 800))).toMatchObject({
      mediaType: 'imagen',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 800,
    });
  });

  it('reconoce HEIC por su marca ftyp', () => {
    expect(inspectMedia(ftyp('heic'))).toMatchObject({
      mediaType: 'imagen',
      mimeType: 'image/heic',
    });
  });

  it('reconoce un mp4 y redondea la duracion hacia arriba', () => {
    expect(inspectMedia(mp4(1000, 12_300))).toMatchObject({
      mediaType: 'video',
      mimeType: 'video/mp4',
      durationSeconds: 13,
    });
  });

  it('devuelve duracion nula si el mp4 no trae moov/mvhd', () => {
    expect(inspectMedia(ftyp('isom'))?.durationSeconds).toBeNull();
  });

  it('rechaza formatos no permitidos aunque lleven otra extension', () => {
    expect(inspectMedia(Buffer.from('GIF89a-contenido-falso'))).toBeNull();
    expect(
      inspectMedia(Buffer.from('MZ ejecutable disfrazado de foto.jpg')),
    ).toBeNull();
    expect(inspectMedia(Buffer.alloc(0))).toBeNull();
  });
});

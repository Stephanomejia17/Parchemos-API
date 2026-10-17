import { decodeCursor, encodeCursor } from './post-cursor';

const VALID = {
  createdAt: '2026-10-17 14:03:22.123456+00',
  id: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
};

describe('post cursor', () => {
  it('conserva los microsegundos de ida y vuelta', () => {
    expect(decodeCursor(encodeCursor(VALID))).toEqual(VALID);
  });

  it.each([
    ['texto que no es base64 de JSON', 'no-es-un-cursor'],
    ['JSON con otra forma', Buffer.from('{"a":1}').toString('base64url')],
    [
      'fecha inyectada',
      encodeCursor({
        createdAt: "2026-01-01'; DROP TABLE posts;--",
        id: VALID.id,
      }),
    ],
    [
      'id que no es uuid',
      encodeCursor({ createdAt: VALID.createdAt, id: 'abc' }),
    ],
  ])('rechaza un cursor invalido: %s', (_label, raw) => {
    expect(() => decodeCursor(raw)).toThrow('El cursor no es válido.');
  });
});

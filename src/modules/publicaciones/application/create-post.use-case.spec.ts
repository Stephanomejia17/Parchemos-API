import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { PostRepository, PostView } from '../domain/post.repository';
import { CreatePostUseCase } from './create-post.use-case';

const PNG = (() => {
  const buffer = Buffer.alloc(33);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'latin1');
  buffer.writeUInt32BE(10, 16);
  buffer.writeUInt32BE(10, 20);
  return buffer;
})();

const file = (name: string, buffer: Buffer, size = buffer.length) => ({
  originalname: name,
  buffer,
  size,
});

function viewOf(locationId: string | null): PostView {
  return {
    id: 'post-1',
    caption: null,
    createdAt: new Date('2026-10-17T10:00:00Z'),
    likeCount: 0,
    author: { id: 'user-1', fullName: 'Ana', photoUrl: null, role: 'comensal' },
    location: locationId ? { id: locationId, name: 'Sede' } : null,
    media: [
      {
        id: 'm1',
        mediaType: 'imagen',
        storageKey: 'posts/user-1/a.png',
        mimeType: 'image/png',
        width: 10,
        height: 10,
        durationSeconds: null,
      },
    ],
  };
}

function setup(
  overrides: { activeLocation?: boolean; createFails?: boolean } = {},
) {
  const posts = {
    isActiveLocation: jest
      .fn()
      .mockResolvedValue(overrides.activeLocation ?? true),
    create: overrides.createFails
      ? jest.fn().mockRejectedValue(new Error('db caida'))
      : jest
          .fn()
          .mockImplementation((data: { locationId: string | null }) =>
            Promise.resolve(viewOf(data.locationId)),
          ),
  };
  let counter = 0;
  const storage = {
    upload: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(`posts/user-1/${++counter}.png`),
      ),
    removeMany: jest.fn().mockResolvedValue(undefined),
    urlFor: jest.fn((key: string) => `https://cdn.test/${key}`),
  };
  const useCase = new CreatePostUseCase(
    posts as unknown as PostRepository,
    storage,
  );
  return { useCase, posts, storage };
}

describe('CreatePostUseCase', () => {
  it('CA1: guarda la publicacion con sus archivos y metadatos', async () => {
    const { useCase, posts, storage } = setup();

    const result = await useCase.execute({
      authorId: 'user-1',
      files: [file('a.png', PNG)],
      caption: '  Qué rico  ',
      locationId: 'loc-1',
    });

    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(posts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: 'user-1',
        locationId: 'loc-1',
        caption: 'Qué rico',
        media: [
          expect.objectContaining({
            mediaType: 'imagen',
            mimeType: 'image/png',
            sizeBytes: PNG.length,
            width: 10,
            height: 10,
            position: 0,
          }),
        ],
      }),
    );
    expect(result.media[0].url).toBe('https://cdn.test/posts/user-1/a.png');
  });

  it('CA3: permite publicar sin restaurante (location_id nulo)', async () => {
    const { useCase, posts } = setup();

    await useCase.execute({ authorId: 'user-1', files: [file('a.png', PNG)] });

    expect(posts.isActiveLocation).not.toHaveBeenCalled();
    expect(posts.create).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: null }),
    );
  });

  it('conserva el orden de seleccion en position', async () => {
    const { useCase, posts } = setup();

    await useCase.execute({
      authorId: 'user-1',
      files: [file('a.png', PNG), file('b.png', PNG)],
    });

    const [args] = posts.create.mock.calls[0] as [
      { media: { position: number }[] },
    ];
    expect(args.media.map((media) => media.position)).toEqual([0, 1]);
  });

  it('RN2: sin archivos responde 400 y no sube nada', async () => {
    const { useCase, storage } = setup();

    await expect(
      useCase.execute({ authorId: 'user-1', files: [] }),
    ).rejects.toThrow(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('CA2: formato no soportado responde 415 con los formatos permitidos', async () => {
    const { useCase, storage } = setup();

    const attempt = useCase.execute({
      authorId: 'user-1',
      files: [file('foto.png', Buffer.from('%PDF-1.7 contenido'))],
    });

    await expect(attempt).rejects.toThrow(UnsupportedMediaTypeException);
    await expect(attempt).rejects.toThrow('JPG, PNG, HEIC y MP4');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('CA4: archivo de mas de 50 MB responde 413 y no sube nada', async () => {
    const { useCase, storage } = setup();

    const attempt = useCase.execute({
      authorId: 'user-1',
      files: [file('grande.png', PNG, 50 * 1024 * 1024 + 1)],
    });

    await expect(attempt).rejects.toThrow(PayloadTooLargeException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rechaza una sede inexistente o no activa antes de subir', async () => {
    const { useCase, storage } = setup({ activeLocation: false });

    await expect(
      useCase.execute({
        authorId: 'user-1',
        files: [file('a.png', PNG)],
        locationId: 'loc-x',
      }),
    ).rejects.toThrow('no existe o no está disponible');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('CA8: si falla el guardado, borra los archivos ya subidos y relanza el error', async () => {
    const { useCase, storage } = setup({ createFails: true });

    await expect(
      useCase.execute({
        authorId: 'user-1',
        files: [file('a.png', PNG), file('b.png', PNG)],
      }),
    ).rejects.toThrow('db caida');

    expect(storage.removeMany).toHaveBeenCalledWith([
      'posts/user-1/1.png',
      'posts/user-1/2.png',
    ]);
  });

  it('CA8: si falla la subida del segundo archivo, limpia el primero', async () => {
    const { useCase, storage, posts } = setup();
    storage.upload
      .mockResolvedValueOnce('posts/user-1/ok.png')
      .mockRejectedValueOnce(new Error('storage caido'));

    await expect(
      useCase.execute({
        authorId: 'user-1',
        files: [file('a.png', PNG), file('b.png', PNG)],
      }),
    ).rejects.toThrow('storage caido');

    expect(posts.create).not.toHaveBeenCalled();
    expect(storage.removeMany).toHaveBeenCalledWith(['posts/user-1/ok.png']);
  });
});

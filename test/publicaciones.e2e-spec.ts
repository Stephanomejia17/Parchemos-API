import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { Role } from '../src/common/enums/role.enum';
import { CreatePostUseCase } from '../src/modules/publicaciones/application/create-post.use-case';
import { GetPostUseCase } from '../src/modules/publicaciones/application/get-post.use-case';
import { ListFeedUseCase } from '../src/modules/publicaciones/application/list-feed.use-case';
import {
  DeleteMyPostUseCase,
  ListMyPostsUseCase,
} from '../src/modules/publicaciones/application/my-posts.use-cases';
import { POST_MEDIA_STORAGE } from '../src/modules/publicaciones/domain/post-media-storage';
import type { PostMediaStorage } from '../src/modules/publicaciones/domain/post-media-storage';
import type { PostCursor } from '../src/modules/publicaciones/domain/post-cursor';
import { POST_REPOSITORY } from '../src/modules/publicaciones/domain/post.repository';
import type {
  FeedSlice,
  NewPost,
  PostRepository,
  PostView,
} from '../src/modules/publicaciones/domain/post.repository';
import { PublicacionesController } from '../src/modules/publicaciones/infrastructure/http/publicaciones.controller';

/**
 * PARCHE-4 (DO-04 + DO-03): publicar y explorar, contra el controlador real
 * con repositorio y almacenamiento en memoria. Cubre CA1-CA10 a nivel HTTP.
 */

const USERS: Record<string, { id: string; role: Role }> = {
  comensal: { id: 'u-comensal', role: Role.COMENSAL },
  restaurante: { id: 'u-restaurante', role: Role.RESTAURANTE },
  admin: { id: 'u-admin', role: Role.ADMINISTRADOR },
};

@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    const user = USERS[String(req.headers['x-test-user'])];
    if (!user) {
      // Mismo contrato que el SupabaseJwtGuard real: sin token -> 401.
      throw new UnauthorizedException();
    }
    req.user = { ...user, email: 'x@test.dev', status: 'activa' };
    return true;
  }
}

const PNG = (() => {
  const buffer = Buffer.alloc(33);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'latin1');
  buffer.writeUInt32BE(8, 16);
  buffer.writeUInt32BE(8, 20);
  return buffer;
})();

const ID_SEDE = '11111111-1111-4111-8111-111111111111';

class InMemoryPostRepository implements PostRepository {
  readonly posts: (PostView & { status: string; stamp: string })[] = [];
  private seq = 0;

  create(data: NewPost): Promise<PostView> {
    const n = ++this.seq;
    // Cada post nace un segundo despues del anterior; `stamp` imita created_at::text.
    const stamp = `2026-10-17 10:00:${String(n).padStart(2, '0')}.000000+00`;
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const view: PostView & { status: string; stamp: string } = {
      id,
      caption: data.caption,
      createdAt: new Date(stamp.replace(' ', 'T').replace('+00', 'Z')),
      likeCount: 0,
      author: {
        id: data.authorId,
        fullName: 'Autor',
        photoUrl: null,
        role: 'comensal',
      },
      location: data.locationId ? { id: data.locationId, name: 'Sede' } : null,
      media: data.media.map((media, index) => ({
        id: `${id}-m${index}`,
        mediaType: media.mediaType,
        storageKey: media.storageKey,
        mimeType: media.mimeType,
        width: media.width,
        height: media.height,
        durationSeconds: media.durationSeconds,
      })),
      status: 'publicada',
      stamp,
    };
    this.posts.push(view);
    return Promise.resolve(view);
  }

  countByAuthor(authorId: string): Promise<number> {
    return Promise.resolve(
      this.posts.filter(
        (p) => p.author.id === authorId && p.status === 'publicada',
      ).length,
    );
  }

  removeByAuthor(id: string, authorId: string): Promise<boolean> {
    const post = this.posts.find(
      (p) =>
        p.id === id && p.author.id === authorId && p.status === 'publicada',
    );
    if (post) post.status = 'eliminada';
    return Promise.resolve(Boolean(post));
  }

  findFeed(
    limit: number,
    after: PostCursor | null,
    authorId?: string,
  ): Promise<FeedSlice> {
    const ordered = this.posts
      .filter((post) => post.status === 'publicada')
      .filter((post) => !authorId || post.author.id === authorId)
      .sort(
        (a, b) => b.stamp.localeCompare(a.stamp) || b.id.localeCompare(a.id),
      )
      .filter(
        (post) =>
          !after ||
          post.stamp < after.createdAt ||
          (post.stamp === after.createdAt && post.id < after.id),
      );
    const items = ordered.slice(0, limit);
    const last = items[items.length - 1];
    return Promise.resolve({
      items,
      next:
        ordered.length > limit && last
          ? { createdAt: last.stamp, id: last.id }
          : null,
    });
  }

  findPublishedById(id: string): Promise<PostView | null> {
    return Promise.resolve(
      this.posts.find((p) => p.id === id && p.status === 'publicada') ?? null,
    );
  }

  isActiveLocation(locationId: string): Promise<boolean> {
    return Promise.resolve(locationId === ID_SEDE);
  }
}

class InMemoryStorage implements PostMediaStorage {
  readonly objects = new Set<string>();
  private seq = 0;

  upload(
    _file: Buffer,
    options: { folder: string; extension: string },
  ): Promise<string> {
    const key = `${options.folder}/${++this.seq}.${options.extension}`;
    this.objects.add(key);
    return Promise.resolve(key);
  }

  removeMany(keys: string[]): Promise<void> {
    keys.forEach((key) => this.objects.delete(key));
    return Promise.resolve();
  }

  urlFor(key: string): string {
    return `https://cdn.test/${key}`;
  }
}

describe('PARCHE-4 publicar y explorar (e2e)', () => {
  let app: INestApplication<App>;
  let repo: InMemoryPostRepository;
  let storage: InMemoryStorage;

  const http = () => request(app.getHttpServer());
  const publicar = (user: string) =>
    http().post('/publicaciones').set('x-test-user', user);
  const feed = (query = '') =>
    http().get(`/feed${query}`).set('x-test-user', 'comensal');

  beforeAll(async () => {
    repo = new InMemoryPostRepository();
    storage = new InMemoryStorage();
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicacionesController],
      providers: [
        CreatePostUseCase,
        ListFeedUseCase,
        GetPostUseCase,
        ListMyPostsUseCase,
        DeleteMyPostUseCase,
        { provide: POST_REPOSITORY, useValue: repo },
        { provide: POST_MEDIA_STORAGE, useValue: storage },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  it('CA6: feed vacio -> lista vacia y nextCursor nulo', async () => {
    const res = await feed().expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('CA10: sin sesion responde 401 y no crea la publicacion', async () => {
    await http()
      .post('/publicaciones')
      .attach('files', PNG, 'a.png')
      .expect(401);
    expect(repo.posts).toHaveLength(0);
  });

  it('CA10: un rol distinto de comensal/restaurante responde 403', async () => {
    await publicar('admin').attach('files', PNG, 'a.png').expect(403);
    expect(repo.posts).toHaveLength(0);
  });

  it('CA1: un comensal publica con restaurante y el autor sale del token', async () => {
    const res = await publicar('comensal')
      .field('caption', 'Delicioso')
      .field('locationId', ID_SEDE)
      .attach('files', PNG, 'a.png')
      .expect(201);

    const body = res.body as {
      author: { id: string };
      location: { id: string };
      media: { url: string; mediaType: string }[];
    };
    expect(body.author.id).toBe('u-comensal');
    expect(body.location.id).toBe(ID_SEDE);
    expect(body.media[0]).toMatchObject({ mediaType: 'imagen' });
    expect(body.media[0].url).toMatch(
      /^https:\/\/cdn\.test\/posts\/u-comensal\//,
    );
  });

  it('CA3: un restaurante puede publicar sin asociar sede', async () => {
    const res = await publicar('restaurante')
      .attach('files', PNG, 'a.png')
      .expect(201);
    expect((res.body as { location: unknown }).location).toBeNull();
  });

  it('RN2: sin archivos responde 400', async () => {
    await publicar('comensal').field('caption', 'sin foto').expect(400);
  });

  it('CA2: un archivo que no es jpg/png/heic/mp4 responde 415 aunque se llame .png', async () => {
    const before = storage.objects.size;
    const res = await publicar('comensal')
      .attach('files', Buffer.from('%PDF-1.7 falso'), 'foto.png')
      .expect(415);
    expect((res.body as { message: string }).message).toContain(
      'JPG, PNG, HEIC y MP4',
    );
    expect(storage.objects.size).toBe(before);
  });

  it('una sede inexistente responde 404 y no sube nada', async () => {
    const before = storage.objects.size;
    await publicar('comensal')
      .field('locationId', '22222222-2222-4222-8222-222222222222')
      .attach('files', PNG, 'a.png')
      .expect(404);
    expect(storage.objects.size).toBe(before);
  });

  it('CA5/CA7: el feed va de lo mas reciente a lo mas antiguo y pagina sin duplicar ni omitir', async () => {
    for (let i = 0; i < 4; i++) {
      await publicar('comensal')
        .field('caption', `extra ${i}`)
        .attach('files', PNG, 'a.png')
        .expect(201);
    }
    const total = repo.posts.length;

    const first = await feed('?limit=3').expect(200);
    const firstBody = first.body as {
      items: { id: string }[];
      nextCursor: string | null;
    };
    expect(firstBody.items).toHaveLength(3);
    expect(firstBody.nextCursor).not.toBeNull();

    const seen = [...firstBody.items.map((item) => item.id)];
    let cursor = firstBody.nextCursor;
    while (cursor) {
      const page = await feed(`?limit=3&cursor=${cursor}`).expect(200);
      const body = page.body as {
        items: { id: string }[];
        nextCursor: string | null;
      };
      seen.push(...body.items.map((item) => item.id));
      cursor = body.nextCursor;
    }

    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    // El mas reciente primero (CA1: la nueva publicacion queda arriba).
    expect(seen[0]).toBe(repo.posts[repo.posts.length - 1].id);
  });

  it('CA9: una publicacion oculta no aparece en el feed ni en el detalle', async () => {
    const hidden = repo.posts[0];
    hidden.status = 'oculta';

    const res = await feed('?limit=50').expect(200);
    const ids = (res.body as { items: { id: string }[] }).items.map(
      (i) => i.id,
    );
    expect(ids).not.toContain(hidden.id);

    await http()
      .get(`/publicaciones/${hidden.id}`)
      .set('x-test-user', 'comensal')
      .expect(404);
  });

  it('un cursor invalido responde 400 y limit > 50 tambien', async () => {
    await feed('?cursor=basura').expect(400);
    await feed('?limit=51').expect(400);
  });

  it('el feed exige sesion', async () => {
    await http().get('/feed').expect(401);
  });

  describe('perfil: mis publicaciones', () => {
    const mine = (user: string, query = '') =>
      http().get(`/publicaciones/mias${query}`).set('x-test-user', user);

    it('lista solo las publicaciones del usuario y el total', async () => {
      const res = await mine('restaurante').expect(200);
      const body = res.body as {
        items: { author: { id: string } }[];
        total: number | null;
      };

      expect(body.items.length).toBeGreaterThan(0);
      expect(
        body.items.every((item) => item.author.id === 'u-restaurante'),
      ).toBe(true);
      expect(body.total).toBe(body.items.length);
    });

    it('en paginas siguientes no repite el total', async () => {
      const first = await mine('comensal', '?limit=2').expect(200);
      const cursor = (first.body as { nextCursor: string }).nextCursor;
      const next = await mine('comensal', `?limit=2&cursor=${cursor}`).expect(
        200,
      );
      expect((next.body as { total: number | null }).total).toBeNull();
    });

    it('exige sesion y rol de comensal o restaurante', async () => {
      await http().get('/publicaciones/mias').expect(401);
      await mine('admin').expect(403);
    });

    it('el autor puede borrar la suya y deja de aparecer en el feed', async () => {
      const created = await publicar('restaurante')
        .attach('files', PNG, 'borrar.png')
        .expect(201);
      const id = (created.body as { id: string }).id;

      await http()
        .delete(`/publicaciones/${id}`)
        .set('x-test-user', 'restaurante')
        .expect(204);

      await http()
        .get(`/publicaciones/${id}`)
        .set('x-test-user', 'comensal')
        .expect(404);
    });

    it('no se puede borrar la de otro (404) ni dos veces', async () => {
      const created = await publicar('comensal')
        .attach('files', PNG, 'ajena.png')
        .expect(201);
      const id = (created.body as { id: string }).id;

      await http()
        .delete(`/publicaciones/${id}`)
        .set('x-test-user', 'restaurante')
        .expect(404);
      await http()
        .delete(`/publicaciones/${id}`)
        .set('x-test-user', 'comensal')
        .expect(204);
      await http()
        .delete(`/publicaciones/${id}`)
        .set('x-test-user', 'comensal')
        .expect(404);
    });
  });
});

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
import { Role } from '../src/common/enums/role.enum';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { CreatePostUseCase } from '../src/modules/publicaciones/application/create-post.use-case';
import { GetPostUseCase } from '../src/modules/publicaciones/application/get-post.use-case';
import { RegisterPostViewUseCase } from '../src/modules/publicaciones/application/register-post-view.use-case';
import { ListFeedUseCase } from '../src/modules/publicaciones/application/list-feed.use-case';
import {
  DeleteMyPostUseCase,
  ListMyPostsUseCase,
} from '../src/modules/publicaciones/application/my-posts.use-cases';
import {
  AddCommentUseCase,
  DeleteCommentUseCase,
  ListCommentsUseCase,
  SetPostLikeUseCase,
} from '../src/modules/publicaciones/application/post-interactions.use-cases';
import type { PostCursor } from '../src/modules/publicaciones/domain/post-cursor';
import { POST_INTERACTION_REPOSITORY } from '../src/modules/publicaciones/domain/post-interaction.repository';
import type {
  CommentsSlice,
  CommentView,
  PostInteractionRepository,
} from '../src/modules/publicaciones/domain/post-interaction.repository';
import { POST_MEDIA_STORAGE } from '../src/modules/publicaciones/domain/post-media-storage';
import type { PostMediaStorage } from '../src/modules/publicaciones/domain/post-media-storage';
import { POST_REPOSITORY } from '../src/modules/publicaciones/domain/post.repository';
import type {
  FeedQuery,
  FeedSlice,
  LocationUse,
  NewPost,
  PostRepository,
  PostView,
} from '../src/modules/publicaciones/domain/post.repository';
import { PostInteractionsController } from '../src/modules/publicaciones/infrastructure/http/post-interactions.controller';
import { PublicacionesController } from '../src/modules/publicaciones/infrastructure/http/publicaciones.controller';

/**
 * PARCHE-4 (DO-04 + DO-03): publicar, explorar, marca + sede, likes y
 * comentarios, contra los controladores reales con repositorios en memoria.
 */

const USERS: Record<string, { id: string; role: Role }> = {
  comensal: { id: 'u-comensal', role: Role.COMENSAL },
  otro: { id: 'u-otro', role: Role.COMENSAL },
  restaurante: { id: 'u-restaurante', role: Role.RESTAURANTE },
  otraMarca: { id: 'u-otra-marca', role: Role.RESTAURANTE },
  admin: { id: 'u-admin', role: Role.ADMINISTRADOR },
};

@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    const user = USERS[String(req.headers['x-test-user'])];
    // Mismo contrato que el SupabaseJwtGuard real: sin token -> 401.
    if (!user) throw new UnauthorizedException();
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

/** NATS tiene dos sedes (dueño: restaurante); K05 es de otra marca (otraMarca). */
const SEDE_NATS_1 = '11111111-1111-4111-8111-111111111111';
const SEDE_NATS_2 = '22222222-2222-4222-8222-222222222222';
const SEDE_K05 = '33333333-3333-4333-8333-333333333333';
const SEDE_INACTIVA = '44444444-4444-4444-8444-444444444444';

const SEDES: Record<
  string,
  {
    name: string;
    brandId: string;
    brand: string;
    ownerId: string;
    active: boolean;
  }
> = {
  [SEDE_NATS_1]: {
    name: 'Sede Laureles',
    brandId: 'b-nats',
    brand: 'NATS',
    ownerId: 'u-restaurante',
    active: true,
  },
  [SEDE_NATS_2]: {
    name: 'Sede Poblado',
    brandId: 'b-nats',
    brand: 'NATS',
    ownerId: 'u-restaurante',
    active: true,
  },
  [SEDE_K05]: {
    name: 'Sede Centro',
    brandId: 'b-k05',
    brand: 'K05',
    ownerId: 'u-otra-marca',
    active: true,
  },
  [SEDE_INACTIVA]: {
    name: 'Sede Cerrada',
    brandId: 'b-nats',
    brand: 'NATS',
    ownerId: 'u-restaurante',
    active: false,
  },
};

interface StoredPost {
  id: string;
  authorId: string;
  authorRole: Role;
  locationId: string | null;
  caption: string | null;
  mediaKeys: string[];
  status: string;
  stamp: string;
  likes: Set<string>;
}

interface StoredComment {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  stamp: string;
}

/** Estado compartido por los dos repositorios, como las tablas de la BD. */
class Store {
  posts: StoredPost[] = [];
  comments: StoredComment[] = [];
  seq = 0;
  nextStamp() {
    return `2026-10-26 10:00:${String(++this.seq).padStart(2, '0')}.000000+00`;
  }
  nextId(prefix: string) {
    return `${prefix}-0000-4000-8000-${String(this.seq).padStart(12, '0')}`;
  }
}

const roleOf = (userId: string) =>
  Object.values(USERS).find((u) => u.id === userId)?.role ?? Role.COMENSAL;

function viewOf(store: Store, post: StoredPost, viewerId?: string): PostView {
  const sede = post.locationId ? SEDES[post.locationId] : null;
  return {
    id: post.id,
    caption: post.caption,
    createdAt: new Date(post.stamp.replace(' ', 'T').replace('+00', 'Z')),
    likeCount: post.likes.size,
    commentCount: store.comments.filter((c) => c.postId === post.id).length,
    likedByMe: viewerId ? post.likes.has(viewerId) : false,
    author: {
      id: post.authorId,
      fullName: 'Autor',
      photoUrl: null,
      role: post.authorRole,
    },
    location:
      post.locationId && sede
        ? {
            id: post.locationId,
            name: sede.name,
            restaurant: { id: sede.brandId, businessName: sede.brand },
          }
        : null,
    media: post.mediaKeys.map((key, index) => ({
      id: `${post.id}-m${index}`,
      mediaType: 'imagen' as const,
      storageKey: key,
      mimeType: 'image/png',
      width: 8,
      height: 8,
      durationSeconds: null,
    })),
  };
}

class InMemoryPostRepository implements PostRepository {
  constructor(private readonly store: Store) {}

  create(data: NewPost): Promise<PostView> {
    this.store.seq++;
    const post: StoredPost = {
      id: this.store.nextId('00000000'),
      authorId: data.authorId,
      authorRole: roleOf(data.authorId),
      locationId: data.locationId,
      caption: data.caption,
      mediaKeys: data.media.map((m) => m.storageKey),
      status: 'publicada',
      stamp: this.store.nextStamp(),
      likes: new Set(),
    };
    this.store.posts.push(post);
    return Promise.resolve(viewOf(this.store, post, data.authorId));
  }

  countByAuthor(authorId: string): Promise<number> {
    return Promise.resolve(
      this.store.posts.filter(
        (p) => p.authorId === authorId && p.status === 'publicada',
      ).length,
    );
  }

  removeByAuthor(id: string, authorId: string): Promise<boolean> {
    const post = this.store.posts.find(
      (p) => p.id === id && p.authorId === authorId && p.status === 'publicada',
    );
    if (post) post.status = 'eliminada';
    return Promise.resolve(Boolean(post));
  }

  findFeed(query: FeedQuery): Promise<FeedSlice> {
    const { limit, after, authorId, locationId, viewerId } = query;
    const ordered = this.store.posts
      .filter((p) => p.status === 'publicada')
      .filter((p) => !authorId || p.authorId === authorId)
      .filter((p) => !locationId || p.locationId === locationId)
      .sort(
        (a, b) => b.stamp.localeCompare(a.stamp) || b.id.localeCompare(a.id),
      )
      .filter(
        (p) =>
          !after ||
          p.stamp < after.createdAt ||
          (p.stamp === after.createdAt && p.id < after.id),
      );
    const items = ordered.slice(0, limit);
    const last = items[items.length - 1];
    return Promise.resolve({
      items: items.map((p) => viewOf(this.store, p, viewerId)),
      next:
        ordered.length > limit && last
          ? { createdAt: last.stamp, id: last.id }
          : null,
    });
  }

  findPublishedById(id: string, viewerId?: string): Promise<PostView | null> {
    const post = this.store.posts.find(
      (p) => p.id === id && p.status === 'publicada',
    );
    return Promise.resolve(post ? viewOf(this.store, post, viewerId) : null);
  }

  checkLocation(locationId: string, ownerId?: string): Promise<LocationUse> {
    const sede = SEDES[locationId];
    if (!sede?.active) return Promise.resolve('not_found');
    if (ownerId && sede.ownerId !== ownerId)
      return Promise.resolve('not_owned');
    return Promise.resolve('ok');
  }
}

class InMemoryInteractions implements PostInteractionRepository {
  constructor(private readonly store: Store) {}

  private post(id: string) {
    return this.store.posts.find((p) => p.id === id);
  }

  isPublished(postId: string): Promise<boolean> {
    return Promise.resolve(this.post(postId)?.status === 'publicada');
  }

  like(postId: string, userId: string): Promise<number> {
    const post = this.post(postId);
    post?.likes.add(userId);
    return Promise.resolve(post?.likes.size ?? 0);
  }

  unlike(postId: string, userId: string): Promise<number> {
    const post = this.post(postId);
    post?.likes.delete(userId);
    return Promise.resolve(post?.likes.size ?? 0);
  }

  private toView(c: StoredComment): CommentView {
    return {
      id: c.id,
      postId: c.postId,
      body: c.body,
      createdAt: new Date(c.stamp.replace(' ', 'T').replace('+00', 'Z')),
      author: {
        id: c.authorId,
        fullName: 'Autor',
        photoUrl: null,
        role: roleOf(c.authorId),
      },
    };
  }

  addComment(data: {
    postId: string;
    authorId: string;
    body: string;
  }): Promise<CommentView> {
    this.store.seq++;
    const comment: StoredComment = {
      id: this.store.nextId('cccccccc'),
      stamp: this.store.nextStamp(),
      ...data,
    };
    this.store.comments.push(comment);
    return Promise.resolve(this.toView(comment));
  }

  listComments(
    postId: string,
    limit: number,
    after: PostCursor | null,
  ): Promise<CommentsSlice> {
    const ordered = this.store.comments
      .filter((c) => c.postId === postId)
      .sort(
        (a, b) => b.stamp.localeCompare(a.stamp) || b.id.localeCompare(a.id),
      )
      .filter(
        (c) =>
          !after ||
          c.stamp < after.createdAt ||
          (c.stamp === after.createdAt && c.id < after.id),
      );
    const items = ordered.slice(0, limit);
    const last = items[items.length - 1];
    return Promise.resolve({
      items: items.map((c) => this.toView(c)),
      next:
        ordered.length > limit && last
          ? { createdAt: last.stamp, id: last.id }
          : null,
    });
  }

  countComments(postId: string): Promise<number> {
    return Promise.resolve(
      this.store.comments.filter((c) => c.postId === postId).length,
    );
  }

  removeComment(commentId: string, userId: string): Promise<boolean> {
    const index = this.store.comments.findIndex((c) => c.id === commentId);
    if (index < 0) return Promise.resolve(false);
    const comment = this.store.comments[index];
    const allowed =
      comment.authorId === userId ||
      this.post(comment.postId)?.authorId === userId;
    if (allowed) this.store.comments.splice(index, 1);
    return Promise.resolve(allowed);
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

interface PostJson {
  id: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  author: { id: string };
  location: {
    id: string;
    name: string;
    restaurant: { id: string; businessName: string };
  } | null;
  media: { url: string; mediaType: string }[];
}

describe('PARCHE-4 publicar, explorar, likes y comentarios (e2e)', () => {
  let app: INestApplication<App>;
  let store: Store;
  let storage: InMemoryStorage;

  const http = () => request(app.getHttpServer());
  const as = (user: string) => ({
    get: (url: string) => http().get(url).set('x-test-user', user),
    post: (url: string) => http().post(url).set('x-test-user', user),
    del: (url: string) => http().delete(url).set('x-test-user', user),
  });
  const publicar = (user: string) => as(user).post('/publicaciones');
  const feed = (query = '', user = 'comensal') => as(user).get(`/feed${query}`);
  const publish = async (
    user: string,
    locationId?: string,
    caption?: string,
  ) => {
    let req = publicar(user).attach('files', PNG, 'a.png');
    if (locationId) req = req.field('locationId', locationId);
    if (caption) req = req.field('caption', caption);
    const res = await req.expect(201);
    return res.body as PostJson;
  };

  beforeAll(async () => {
    store = new Store();
    storage = new InMemoryStorage();
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicacionesController, PostInteractionsController],
      providers: [
        CreatePostUseCase,
        ListFeedUseCase,
        GetPostUseCase,
        ListMyPostsUseCase,
        DeleteMyPostUseCase,
        SetPostLikeUseCase,
        AddCommentUseCase,
        ListCommentsUseCase,
        DeleteCommentUseCase,
        // Vistas (AE-03): ajeno a este flujo; el caso de uso real usa Prisma directo.
        {
          provide: RegisterPostViewUseCase,
          useValue: { execute: () => Promise.resolve() },
        },
        {
          provide: POST_REPOSITORY,
          useValue: new InMemoryPostRepository(store),
        },
        {
          provide: POST_INTERACTION_REPOSITORY,
          useValue: new InMemoryInteractions(store),
        },
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

  describe('publicar', () => {
    it('CA6: feed vacio -> lista vacia y nextCursor nulo', async () => {
      const res = await feed().expect(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it('CA10: sin sesion responde 401 y no crea la publicacion', async () => {
      await http()
        .post('/publicaciones')
        .attach('files', PNG, 'a.png')
        .expect(401);
      expect(store.posts).toHaveLength(0);
    });

    it('CA10: un rol distinto de comensal/restaurante responde 403', async () => {
      await publicar('admin').attach('files', PNG, 'a.png').expect(403);
      expect(store.posts).toHaveLength(0);
    });

    it('un comensal publica con restaurante: queda ligada a la sede y a su marca', async () => {
      const post = await publish('comensal', SEDE_NATS_1, 'Delicioso');

      expect(post.author.id).toBe('u-comensal');
      expect(post.location).toEqual({
        id: SEDE_NATS_1,
        name: 'Sede Laureles',
        restaurant: { id: 'b-nats', businessName: 'NATS' },
      });
      expect(post.media[0].url).toMatch(
        /^https:\/\/cdn\.test\/posts\/u-comensal\//,
      );
      expect(post).toMatchObject({
        likeCount: 0,
        commentCount: 0,
        likedByMe: false,
      });
    });

    it('CA3: un comensal puede publicar sin restaurante', async () => {
      const post = await publish('comensal');
      expect(post.location).toBeNull();
    });

    it('un restaurante debe elegir la sede (400) aunque tenga varias', async () => {
      const before = storage.objects.size;
      const res = await publicar('restaurante')
        .attach('files', PNG, 'a.png')
        .expect(400);

      expect((res.body as { code: string }).code).toBe('LOCATION_REQUIRED');
      expect(storage.objects.size).toBe(before);
    });

    it('un dueño con dos sedes publica en cada una, siempre con la misma marca', async () => {
      const uno = await publish('restaurante', SEDE_NATS_1);
      const dos = await publish('restaurante', SEDE_NATS_2);

      expect(uno.location?.name).toBe('Sede Laureles');
      expect(dos.location?.name).toBe('Sede Poblado');
      expect(uno.location?.restaurant).toEqual(dos.location?.restaurant);
    });

    it('un restaurante no puede publicar en la sede de otra marca (403)', async () => {
      const before = storage.objects.size;
      const res = await publicar('restaurante')
        .field('locationId', SEDE_K05)
        .attach('files', PNG, 'a.png')
        .expect(403);

      expect((res.body as { code: string }).code).toBe('LOCATION_NOT_OWNED');
      expect(storage.objects.size).toBe(before);
    });

    it('una sede inactiva o inexistente responde 404 y no sube nada', async () => {
      const before = storage.objects.size;
      await publicar('restaurante')
        .field('locationId', SEDE_INACTIVA)
        .attach('files', PNG, 'a.png')
        .expect(404);
      await publicar('comensal')
        .field('locationId', '99999999-9999-4999-8999-999999999999')
        .attach('files', PNG, 'a.png')
        .expect(404);
      expect(storage.objects.size).toBe(before);
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
  });

  describe('explorar', () => {
    it('CA5/CA7: del mas reciente al mas antiguo, pagina sin duplicar ni omitir', async () => {
      for (let i = 0; i < 4; i++)
        await publish('comensal', undefined, `extra ${i}`);
      const total = store.posts.filter((p) => p.status === 'publicada').length;

      const first = await feed('?limit=3').expect(200);
      const body = first.body as {
        items: PostJson[];
        nextCursor: string | null;
      };
      expect(body.items).toHaveLength(3);
      expect(body.nextCursor).not.toBeNull();

      const seen = body.items.map((i) => i.id);
      let cursor = body.nextCursor;
      while (cursor) {
        const page = await feed(`?limit=3&cursor=${cursor}`).expect(200);
        const next = page.body as {
          items: PostJson[];
          nextCursor: string | null;
        };
        seen.push(...next.items.map((i) => i.id));
        cursor = next.nextCursor;
      }

      expect(seen).toHaveLength(total);
      expect(new Set(seen).size).toBe(total);
      expect(seen[0]).toBe(store.posts[store.posts.length - 1].id);
    });

    it('CA9: una publicacion oculta no aparece en el feed ni en el detalle', async () => {
      const hidden = store.posts[0];
      hidden.status = 'oculta';

      const res = await feed('?limit=50').expect(200);
      const ids = (res.body as { items: PostJson[] }).items.map((i) => i.id);
      expect(ids).not.toContain(hidden.id);
      await as('comensal').get(`/publicaciones/${hidden.id}`).expect(404);
      hidden.status = 'publicada';
    });

    it('un cursor invalido responde 400 y limit > 50 tambien', async () => {
      await feed('?cursor=basura').expect(400);
      await feed('?limit=51').expect(400);
    });

    it('el feed exige sesion', async () => {
      await http().get('/feed').expect(401);
    });
  });

  describe('perfil: mis publicaciones', () => {
    const mine = (user: string, query = '') =>
      as(user).get(`/publicaciones/mias${query}`);

    it('lista solo las del usuario y el total', async () => {
      const res = await mine('restaurante').expect(200);
      const body = res.body as { items: PostJson[]; total: number };

      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.every((i) => i.author.id === 'u-restaurante')).toBe(
        true,
      );
      expect(body.total).toBe(body.items.length);
    });

    it('un dueño con varias sedes filtra su contenido por sede, sin perder la marca', async () => {
      const res = await mine(
        'restaurante',
        `?locationId=${SEDE_NATS_2}`,
      ).expect(200);
      const { items } = res.body as { items: PostJson[] };

      expect(items).toHaveLength(1);
      expect(items[0].location).toMatchObject({
        id: SEDE_NATS_2,
        restaurant: { businessName: 'NATS' },
      });
    });

    it('el filtro por sede valida el uuid', async () => {
      await mine('restaurante', '?locationId=no-es-uuid').expect(400);
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

    it('el autor puede borrar la suya, y no la de otro (404)', async () => {
      const post = await publish('restaurante', SEDE_NATS_1);

      await as('comensal').del(`/publicaciones/${post.id}`).expect(404);
      await as('restaurante').del(`/publicaciones/${post.id}`).expect(204);
      await as('comensal').get(`/publicaciones/${post.id}`).expect(404);
    });
  });

  describe('likes', () => {
    let postId: string;

    beforeAll(async () => {
      postId = (await publish('restaurante', SEDE_NATS_1)).id;
    });

    it('dar like suma uno y lo marca como likedByMe solo para quien lo dio', async () => {
      const res = await as('comensal')
        .post(`/publicaciones/${postId}/like`)
        .expect(200);
      expect(res.body).toEqual({ liked: true, likeCount: 1 });

      const mine = await as('comensal')
        .get(`/publicaciones/${postId}`)
        .expect(200);
      expect(mine.body).toMatchObject({ likeCount: 1, likedByMe: true });
      const other = await as('otro')
        .get(`/publicaciones/${postId}`)
        .expect(200);
      expect(other.body).toMatchObject({ likeCount: 1, likedByMe: false });
    });

    it('repetir el like (doble clic) no lo duplica', async () => {
      await Promise.all([
        as('comensal').post(`/publicaciones/${postId}/like`),
        as('comensal').post(`/publicaciones/${postId}/like`),
      ]);
      const res = await as('comensal')
        .post(`/publicaciones/${postId}/like`)
        .expect(200);
      expect((res.body as { likeCount: number }).likeCount).toBe(1);
    });

    it('varios usuarios suman, y quitar el like resta (idempotente)', async () => {
      await as('otro').post(`/publicaciones/${postId}/like`).expect(200);
      const quit = await as('comensal')
        .del(`/publicaciones/${postId}/like`)
        .expect(200);
      expect(quit.body).toEqual({ liked: false, likeCount: 1 });
      const again = await as('comensal')
        .del(`/publicaciones/${postId}/like`)
        .expect(200);
      expect((again.body as { likeCount: number }).likeCount).toBe(1);
    });

    it('el feed refleja likeCount y likedByMe del usuario que consulta', async () => {
      const res = await feed('?limit=50', 'otro').expect(200);
      const post = (res.body as { items: PostJson[] }).items.find(
        (p) => p.id === postId,
      );
      expect(post).toMatchObject({ likeCount: 1, likedByMe: true });
    });

    it('un restaurante tambien puede dar like', async () => {
      const res = await as('otraMarca')
        .post(`/publicaciones/${postId}/like`)
        .expect(200);
      expect((res.body as { likeCount: number }).likeCount).toBe(2);
    });

    it('sin sesion 401, rol no permitido 403 y publicacion inexistente u oculta 404', async () => {
      await http().post(`/publicaciones/${postId}/like`).expect(401);
      await as('admin').post(`/publicaciones/${postId}/like`).expect(403);
      await as('comensal')
        .post('/publicaciones/99999999-9999-4999-8999-999999999999/like')
        .expect(404);
      await as('comensal').post('/publicaciones/no-es-uuid/like').expect(400);

      const post = store.posts.find((p) => p.id === postId);
      if (post) post.status = 'oculta';
      await as('comensal').post(`/publicaciones/${postId}/like`).expect(404);
      if (post) post.status = 'publicada';
    });
  });

  describe('comentarios', () => {
    let postId: string;

    beforeAll(async () => {
      postId = (await publish('restaurante', SEDE_NATS_2)).id;
    });

    const comment = (user: string, body: unknown, id = postId) =>
      as(user).post(`/publicaciones/${id}/comentarios`).send({ body });

    it('un comensal comenta y el comentario trae su autor', async () => {
      const res = await comment('comensal', '  Se ve riquísimo  ').expect(201);
      expect(res.body).toMatchObject({
        postId,
        body: 'Se ve riquísimo',
        author: { id: 'u-comensal' },
      });
    });

    it('rechaza comentarios vacios, demasiado largos o con campos extra', async () => {
      await comment('comensal', '   ').expect(400);
      await comment('comensal', 'a'.repeat(501)).expect(400);
      await as('comensal')
        .post(`/publicaciones/${postId}/comentarios`)
        .send({ body: 'hola', authorId: 'u-otro' })
        .expect(400);
    });

    it('lista del mas reciente al mas antiguo, con total y paginacion por cursor', async () => {
      await comment('otro', 'segundo').expect(201);
      await comment('restaurante', 'tercero').expect(201);

      const first = await as('comensal')
        .get(`/publicaciones/${postId}/comentarios?limit=2`)
        .expect(200);
      const page1 = first.body as {
        items: { body: string }[];
        nextCursor: string;
        total: number;
      };
      expect(page1.items.map((c) => c.body)).toEqual(['tercero', 'segundo']);
      expect(page1.total).toBe(3);

      const next = await as('comensal')
        .get(
          `/publicaciones/${postId}/comentarios?limit=2&cursor=${page1.nextCursor}`,
        )
        .expect(200);
      const page2 = next.body as {
        items: { body: string }[];
        nextCursor: string | null;
        total: number | null;
      };
      expect(page2.items.map((c) => c.body)).toEqual(['Se ve riquísimo']);
      expect(page2.nextCursor).toBeNull();
      expect(page2.total).toBeNull();
    });

    it('el contador de comentarios aparece en el feed y en el detalle', async () => {
      const detail = await as('comensal')
        .get(`/publicaciones/${postId}`)
        .expect(200);
      expect((detail.body as PostJson).commentCount).toBe(3);

      const res = await feed('?limit=50').expect(200);
      const post = (res.body as { items: PostJson[] }).items.find(
        (p) => p.id === postId,
      );
      expect(post?.commentCount).toBe(3);
    });

    it('quien escribio el comentario lo borra; un tercero no (404)', async () => {
      const created = await comment('otro', 'para borrar').expect(201);
      const id = (created.body as { id: string }).id;

      await as('comensal').del(`/comentarios/${id}`).expect(404);
      await as('otro').del(`/comentarios/${id}`).expect(204);
      await as('otro').del(`/comentarios/${id}`).expect(404);
    });

    it('el autor de la publicacion puede borrar comentarios ajenos de ella', async () => {
      const created = await comment('comensal', 'moderame').expect(201);
      const id = (created.body as { id: string }).id;

      await as('restaurante').del(`/comentarios/${id}`).expect(204);
    });

    it('sin sesion 401, rol no permitido 403 y publicacion no publicada 404', async () => {
      await http().get(`/publicaciones/${postId}/comentarios`).expect(401);
      await as('admin').get(`/publicaciones/${postId}/comentarios`).expect(403);
      await comment(
        'comensal',
        'hola',
        '99999999-9999-4999-8999-999999999999',
      ).expect(404);

      const post = store.posts.find((p) => p.id === postId);
      if (post) post.status = 'oculta';
      await comment('comensal', 'hola').expect(404);
      await as('comensal')
        .get(`/publicaciones/${postId}/comentarios`)
        .expect(404);
      if (post) post.status = 'publicada';
    });
  });
});

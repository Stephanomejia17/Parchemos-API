import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  IS_PUBLIC_KEY,
  OPTIONAL_AUTH_KEY,
} from '../src/common/decorators/public.decorator';
import { Role } from '../src/common/enums/role.enum';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RolesGuard } from '../src/common/guards/roles.guard';
import {
  AddFavoriteUseCase,
  ListFavoritesUseCase,
  ListFeaturedLocationsUseCase,
  RemoveFavoriteUseCase,
} from '../src/modules/favoritos/application/favorites.use-cases';
import { FAVORITE_REPOSITORY } from '../src/modules/favoritos/domain/favorite.repository';
import type { FavoriteRepository } from '../src/modules/favoritos/domain/favorite.repository';
import {
  DestacadosController,
  FavoritosController,
} from '../src/modules/favoritos/infrastructure/http/favoritos.controller';
import { LOCATION_REPOSITORY } from '../src/modules/restaurants/domain/repositories/location.repository';

/**
 * PARCHE-2 (DO-02 + DO-05): destacados y favoritos, contra los controladores
 * reales con repositorios en memoria. Cubre CA1-CA9 a nivel HTTP.
 */

const USERS: Record<string, { id: string; role: Role }> = {
  ana: { id: 'u-ana', role: Role.COMENSAL },
  luis: { id: 'u-luis', role: Role.COMENSAL },
  restaurante: { id: 'u-rest', role: Role.RESTAURANTE },
};

/** Imita al SupabaseJwtGuard: respeta @Public y @OptionalAuth. */
@Injectable()
class HeaderAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    const optional = this.reflector.getAllAndOverride<boolean>(
      OPTIONAL_AUTH_KEY,
      targets,
    );
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    const user = USERS[String(req.headers['x-test-user'])];

    if (isPublic) {
      if (optional && user) {
        req.user = { ...user, email: 'x@test.dev', status: 'activa' };
      }
      return true;
    }
    if (!user) throw new UnauthorizedException();
    req.user = { ...user, email: 'x@test.dev', status: 'activa' };
    return true;
  }
}

const SEDES = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Alta', avgRating: 4.8 },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Justa', avgRating: 4.5 },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Media', avgRating: 3.9 },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Inactiva',
    avgRating: 5,
    inactive: true,
  },
];
const [ALTA, JUSTA, MEDIA, INACTIVA] = SEDES.map((s) => s.id);

class InMemoryFavorites implements FavoriteRepository {
  readonly rows: { userId: string; locationId: string; at: number }[] = [];
  private clock = 0;

  async add(userId: string, locationId: string): Promise<void> {
    // Simula la latencia de la BD para provocar la carrera del doble clic.
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (
      this.rows.some((r) => r.userId === userId && r.locationId === locationId)
    ) {
      return;
    }
    this.rows.push({ userId, locationId, at: ++this.clock });
  }

  remove(userId: string, locationId: string): Promise<void> {
    const index = this.rows.findIndex(
      (r) => r.userId === userId && r.locationId === locationId,
    );
    if (index >= 0) this.rows.splice(index, 1);
    return Promise.resolve();
  }

  listLocationIds(userId: string): Promise<string[]> {
    return Promise.resolve(
      this.rows
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.at - a.at)
        .map((r) => r.locationId),
    );
  }

  filterFavorites(userId: string, ids: string[]): Promise<Set<string>> {
    return Promise.resolve(
      new Set(
        this.rows
          .filter((r) => r.userId === userId && ids.includes(r.locationId))
          .map((r) => r.locationId),
      ),
    );
  }
}

const locationRepo = {
  findActiveById: (id: string) =>
    Promise.resolve(
      SEDES.find((s) => s.id === id && !s.inactive) ? { id } : null,
    ),
  findActiveByIds: (ids: string[]) =>
    Promise.resolve(SEDES.filter((s) => ids.includes(s.id) && !s.inactive)),
  findTopRated: (limit: number) =>
    Promise.resolve(
      SEDES.filter((s) => !s.inactive)
        .sort((a, b) => b.avgRating - a.avgRating)
        .slice(0, limit),
    ),
};

describe('PARCHE-2 destacados y favoritos (e2e)', () => {
  let app: INestApplication<App>;
  let favorites: InMemoryFavorites;

  const http = () => request(app.getHttpServer());
  const as = (user?: string) => {
    const set = (req: request.Test) =>
      user ? req.set('x-test-user', user) : req;
    return {
      get: (url: string) => set(http().get(url)),
      post: (url: string, body: object = {}) =>
        set(http().post(url)).send(body),
      del: (url: string) => set(http().delete(url)),
    };
  };

  beforeAll(async () => {
    favorites = new InMemoryFavorites();
    const moduleRef = await Test.createTestingModule({
      controllers: [FavoritosController, DestacadosController],
      providers: [
        AddFavoriteUseCase,
        RemoveFavoriteUseCase,
        ListFavoritesUseCase,
        ListFeaturedLocationsUseCase,
        { provide: FAVORITE_REPOSITORY, useValue: favorites },
        { provide: LOCATION_REPOSITORY, useValue: locationRepo },
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

  interface FeaturedJson {
    umbral: number;
    hayDestacados: boolean;
    items: { id: string; destacado: boolean; esFavorito: boolean }[];
  }

  it('CA1: destacados arriba, de mayor a menor calificacion, con la marca', async () => {
    const res = await as().get('/restaurantes/destacados').expect(200);
    const body = res.body as FeaturedJson;

    expect(body.items.map((i) => [i.id, i.destacado])).toEqual([
      [ALTA, true],
      [JUSTA, true],
      [MEDIA, false],
    ]);
    expect(body.hayDestacados).toBe(true);
  });

  it('CA9: el visitante ve el listado, sin favoritos marcados', async () => {
    const res = await as().get('/restaurantes/destacados').expect(200);
    expect((res.body as FeaturedJson).items.every((i) => !i.esFavorito)).toBe(
      true,
    );
  });

  it('CA9: un visitante no puede marcar favoritos (401) y no se guarda nada', async () => {
    await as().post('/favoritos', { locationId: ALTA }).expect(401);
    await as().get('/favoritos').expect(401);
    await as().del(`/favoritos/${ALTA}`).expect(401);
    expect(favorites.rows).toHaveLength(0);
  });

  it('RN6: otros roles no gestionan favoritos (403)', async () => {
    await as('restaurante')
      .post('/favoritos', { locationId: ALTA })
      .expect(403);
    expect(favorites.rows).toHaveLength(0);
  });

  it('CA6: sin favoritos, la lista viene vacia', async () => {
    const res = await as('ana').get('/favoritos').expect(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('CA4/CA7: agregar persiste y el destacado aparece marcado para ese usuario', async () => {
    await as('ana').post('/favoritos', { locationId: JUSTA }).expect(201);

    const mine = await as('ana').get('/favoritos').expect(200);
    expect(
      (mine.body as { items: { id: string }[] }).items.map((i) => i.id),
    ).toEqual([JUSTA]);

    const featured = await as('ana')
      .get('/restaurantes/destacados')
      .expect(200);
    expect(
      (featured.body as FeaturedJson).items.find((i) => i.id === JUSTA)
        ?.esFavorito,
    ).toBe(true);
  });

  it('RN6: cada comensal ve solo sus favoritos', async () => {
    const luis = await as('luis').get('/favoritos').expect(200);
    expect(luis.body).toEqual({ items: [] });

    const featured = await as('luis')
      .get('/restaurantes/destacados')
      .expect(200);
    expect(
      (featured.body as FeaturedJson).items.some((i) => i.esFavorito),
    ).toBe(false);
  });

  it('CA8: dos clics simultaneos dejan un solo registro', async () => {
    await Promise.all([
      as('luis').post('/favoritos', { locationId: ALTA }),
      as('luis').post('/favoritos', { locationId: ALTA }),
      as('luis').post('/favoritos', { locationId: ALTA }),
    ]);

    expect(
      favorites.rows.filter(
        (r) => r.userId === 'u-luis' && r.locationId === ALTA,
      ),
    ).toHaveLength(1);
  });

  it('CA5: quitar lo saca de la lista, y repetir el borrado no falla', async () => {
    await as('ana').del(`/favoritos/${JUSTA}`).expect(204);
    await as('ana').del(`/favoritos/${JUSTA}`).expect(204);

    const mine = await as('ana').get('/favoritos').expect(200);
    expect(mine.body).toEqual({ items: [] });
  });

  it('una sede inexistente o inactiva responde 404 y un id invalido 400', async () => {
    await as('ana').post('/favoritos', { locationId: INACTIVA }).expect(404);
    await as('ana')
      .post('/favoritos', { locationId: 'no-es-uuid' })
      .expect(400);
    await as('ana').del('/favoritos/no-es-uuid').expect(400);
  });

  it('el limite de destacados se valida', async () => {
    await as().get('/restaurantes/destacados?limit=51').expect(400);
    const res = await as().get('/restaurantes/destacados?limit=1').expect(200);
    expect((res.body as FeaturedJson).items).toHaveLength(1);
  });
});

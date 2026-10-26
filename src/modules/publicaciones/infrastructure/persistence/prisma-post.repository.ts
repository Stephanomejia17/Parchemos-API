import { Injectable } from '@nestjs/common';
import {
  LocationStatus as PrismaLocationStatus,
  Prisma,
  PostStatus,
} from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import type {
  FeedQuery,
  FeedSlice,
  LocationUse,
  NewPost,
  PostRepository,
  PostView,
} from '../../domain/post.repository';

const postInclude = {
  author: {
    select: {
      id: true,
      role: true,
      profile: { select: { fullName: true, photoUrl: true } },
    },
  },
  // La sede viaja siempre con su marca: el contenido queda ligado a las dos.
  location: {
    select: {
      id: true,
      name: true,
      restaurant: { select: { id: true, businessName: true } },
    },
  },
  media: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.PostInclude;

type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;

interface Extras {
  commentCount: number;
  likedByMe: boolean;
}

function toView(row: PostRow, extras: Extras): PostView {
  return {
    id: row.id,
    caption: row.caption,
    createdAt: row.createdAt,
    likeCount: row.likeCount,
    commentCount: extras.commentCount,
    likedByMe: extras.likedByMe,
    author: {
      id: row.author.id,
      fullName: row.author.profile?.fullName ?? 'Usuario Parchemos',
      photoUrl: row.author.profile?.photoUrl ?? null,
      role: row.author.role,
    },
    location: row.location,
    media: row.media.map((media) => ({
      id: media.id,
      mediaType: media.mediaType,
      storageKey: media.storageKey,
      mimeType: media.mimeType,
      width: media.width,
      height: media.height,
      durationSeconds: media.durationSeconds,
    })),
  };
}

@Injectable()
export class PrismaPostRepository implements PostRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NewPost): Promise<PostView> {
    // Escritura anidada: Prisma la ejecuta en una sola transaccion, asi que no
    // puede quedar un post sin sus medios (ni medios sin post).
    const row = await this.prisma.post.create({
      data: {
        authorId: data.authorId,
        locationId: data.locationId,
        caption: data.caption,
        status: PostStatus.publicada,
        media: {
          create: data.media.map((media) => ({
            mediaType: media.mediaType,
            storageKey: media.storageKey,
            mimeType: media.mimeType,
            sizeBytes: BigInt(media.sizeBytes),
            width: media.width,
            height: media.height,
            durationSeconds: media.durationSeconds,
            position: media.position,
          })),
        },
      },
      include: postInclude,
    });
    return toView(row, { commentCount: 0, likedByMe: false });
  }

  async countByAuthor(authorId: string): Promise<number> {
    return this.prisma.post.count({
      where: { authorId, status: PostStatus.publicada },
    });
  }

  async removeByAuthor(id: string, authorId: string): Promise<boolean> {
    const { count } = await this.prisma.post.updateMany({
      where: { id, authorId, status: PostStatus.publicada },
      data: {
        status: PostStatus.eliminada,
        removedById: authorId,
        removalReason: 'Eliminada por su autor',
        removedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return count > 0;
  }

  async findFeed(query: FeedQuery): Promise<FeedSlice> {
    const { limit, after, authorId, locationId, viewerId } = query;
    // Keyset sobre (created_at, id): usa posts_feed_idx sin OFFSET (PARCHE-76/77).
    // `created_at::text` conserva los microsegundos que `Date` perderia.
    const page = await this.prisma.$queryRaw<
      { id: string; created_at: string }[]
    >(Prisma.sql`
      SELECT id, created_at::text AS created_at
      FROM public.posts
      WHERE status = 'publicada'
      ${authorId ? Prisma.sql`AND author_id = ${authorId}::uuid` : Prisma.empty}
      ${locationId ? Prisma.sql`AND location_id = ${locationId}::uuid` : Prisma.empty}
      ${
        after
          ? Prisma.sql`AND (created_at, id) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`
          : Prisma.empty
      }
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1}
    `);

    const hasMore = page.length > limit;
    const slice = hasMore ? page.slice(0, limit) : page;
    if (!slice.length) return { items: [], next: null };

    const ids = slice.map((entry) => entry.id);
    const [rows, extras] = await Promise.all([
      this.prisma.post.findMany({
        where: { id: { in: ids } },
        include: postInclude,
      }),
      this.loadExtras(ids, viewerId),
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = slice
      .map((entry) => byId.get(entry.id))
      .filter((row): row is PostRow => row !== undefined)
      .map((row) =>
        toView(
          row,
          extras.get(row.id) ?? { commentCount: 0, likedByMe: false },
        ),
      );

    const last = slice[slice.length - 1];
    return {
      items,
      next: hasMore ? { createdAt: last.created_at, id: last.id } : null,
    };
  }

  async findPublishedById(
    id: string,
    viewerId?: string,
  ): Promise<PostView | null> {
    const row = await this.prisma.post.findFirst({
      where: { id, status: PostStatus.publicada },
      include: postInclude,
    });
    if (!row) return null;
    const extras = await this.loadExtras([row.id], viewerId);
    return toView(
      row,
      extras.get(row.id) ?? { commentCount: 0, likedByMe: false },
    );
  }

  async checkLocation(
    locationId: string,
    ownerId?: string,
  ): Promise<LocationUse> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, status: PrismaLocationStatus.activa },
      select: { restaurant: { select: { ownerId: true } } },
    });
    if (!location) return 'not_found';
    if (ownerId && location.restaurant.ownerId !== ownerId) return 'not_owned';
    return 'ok';
  }

  /** Cantidad de comentarios y si `viewerId` dio like, para varias publicaciones a la vez. */
  private async loadExtras(
    postIds: string[],
    viewerId?: string,
  ): Promise<Map<string, Extras>> {
    const [comments, likes] = await Promise.all([
      this.prisma.postComment.groupBy({
        by: ['postId'],
        where: { postId: { in: postIds } },
        _count: { _all: true },
      }),
      viewerId
        ? this.prisma.postLike.findMany({
            where: { userId: viewerId, postId: { in: postIds } },
            select: { postId: true },
          })
        : Promise.resolve([] as { postId: string }[]),
    ]);
    const commentCounts = new Map(
      comments.map((row) => [row.postId, row._count._all]),
    );
    const liked = new Set(likes.map((row) => row.postId));
    return new Map(
      postIds.map((id) => [
        id,
        { commentCount: commentCounts.get(id) ?? 0, likedByMe: liked.has(id) },
      ]),
    );
  }
}

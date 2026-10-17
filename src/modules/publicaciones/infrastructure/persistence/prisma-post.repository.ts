import { Injectable } from '@nestjs/common';
import {
  LocationStatus as PrismaLocationStatus,
  Prisma,
  PostStatus,
} from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import type { PostCursor } from '../../domain/post-cursor';
import type {
  FeedSlice,
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
  location: { select: { id: true, name: true } },
  media: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.PostInclude;

type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;

function toView(row: PostRow): PostView {
  return {
    id: row.id,
    caption: row.caption,
    createdAt: row.createdAt,
    likeCount: row.likeCount,
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
    return toView(row);
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

  async findFeed(
    limit: number,
    after: PostCursor | null,
    authorId?: string,
  ): Promise<FeedSlice> {
    // Keyset sobre (created_at, id): usa posts_feed_idx sin OFFSET (PARCHE-76/77).
    // `created_at::text` conserva los microsegundos que `Date` perderia.
    const page = await this.prisma.$queryRaw<
      { id: string; created_at: string }[]
    >(Prisma.sql`
      SELECT id, created_at::text AS created_at
      FROM public.posts
      WHERE status = 'publicada'
      ${authorId ? Prisma.sql`AND author_id = ${authorId}::uuid` : Prisma.empty}
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

    const rows = await this.prisma.post.findMany({
      where: { id: { in: slice.map((entry) => entry.id) } },
      include: postInclude,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = slice
      .map((entry) => byId.get(entry.id))
      .filter((row): row is PostRow => row !== undefined)
      .map(toView);

    const last = slice[slice.length - 1];
    return {
      items,
      next: hasMore ? { createdAt: last.created_at, id: last.id } : null,
    };
  }

  async findPublishedById(id: string): Promise<PostView | null> {
    const row = await this.prisma.post.findFirst({
      where: { id, status: PostStatus.publicada },
      include: postInclude,
    });
    return row ? toView(row) : null;
  }

  async isActiveLocation(locationId: string): Promise<boolean> {
    const count = await this.prisma.location.count({
      where: { id: locationId, status: PrismaLocationStatus.activa },
    });
    return count > 0;
  }
}

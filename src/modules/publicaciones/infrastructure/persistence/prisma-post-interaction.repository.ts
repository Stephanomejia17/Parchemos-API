import { Injectable } from '@nestjs/common';
import { PostStatus, Prisma } from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import type { PostCursor } from '../../domain/post-cursor';
import type {
  CommentsSlice,
  CommentView,
  PostInteractionRepository,
} from '../../domain/post-interaction.repository';

const commentInclude = {
  author: {
    select: {
      id: true,
      role: true,
      profile: { select: { fullName: true, photoUrl: true } },
    },
  },
} satisfies Prisma.PostCommentInclude;

type CommentRow = Prisma.PostCommentGetPayload<{
  include: typeof commentInclude;
}>;

function toComment(row: CommentRow): CommentView {
  return {
    id: row.id,
    postId: row.postId,
    body: row.body,
    createdAt: row.createdAt,
    author: {
      id: row.author.id,
      fullName: row.author.profile?.fullName ?? 'Usuario Parchemos',
      photoUrl: row.author.profile?.photoUrl ?? null,
      role: row.author.role,
    },
  };
}

@Injectable()
export class PrismaPostInteractionRepository implements PostInteractionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isPublished(postId: string): Promise<boolean> {
    const count = await this.prisma.post.count({
      where: { id: postId, status: PostStatus.publicada },
    });
    return count > 0;
  }

  async like(postId: string, userId: string): Promise<number> {
    // INSERT ... ON CONFLICT DO NOTHING: un doble clic no duplica ni falla.
    await this.prisma.postLike.createMany({
      data: [{ postId, userId }],
      skipDuplicates: true,
    });
    return this.likeCount(postId);
  }

  async unlike(postId: string, userId: string): Promise<number> {
    await this.prisma.postLike.deleteMany({ where: { postId, userId } });
    return this.likeCount(postId);
  }

  async addComment(data: {
    postId: string;
    authorId: string;
    body: string;
  }): Promise<CommentView> {
    const row = await this.prisma.postComment.create({
      data,
      include: commentInclude,
    });
    return toComment(row);
  }

  async listComments(
    postId: string,
    limit: number,
    after: PostCursor | null,
  ): Promise<CommentsSlice> {
    // Mismo keyset (created_at, id) que el feed; usa post_comments_post_idx.
    const page = await this.prisma.$queryRaw<
      { id: string; created_at: string }[]
    >(Prisma.sql`
      SELECT id, created_at::text AS created_at
      FROM public.post_comments
      WHERE post_id = ${postId}::uuid
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

    const rows = await this.prisma.postComment.findMany({
      where: { id: { in: slice.map((entry) => entry.id) } },
      include: commentInclude,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = slice
      .map((entry) => byId.get(entry.id))
      .filter((row): row is CommentRow => row !== undefined)
      .map(toComment);

    const last = slice[slice.length - 1];
    return {
      items,
      next: hasMore ? { createdAt: last.created_at, id: last.id } : null,
    };
  }

  countComments(postId: string): Promise<number> {
    return this.prisma.postComment.count({ where: { postId } });
  }

  async removeComment(commentId: string, userId: string): Promise<boolean> {
    // Lo retira quien lo escribio o el autor de la publicacion.
    const { count } = await this.prisma.postComment.deleteMany({
      where: {
        id: commentId,
        OR: [{ authorId: userId }, { post: { authorId: userId } }],
      },
    });
    return count > 0;
  }

  private async likeCount(postId: string): Promise<number> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { likeCount: true },
    });
    return post?.likeCount ?? 0;
  }
}

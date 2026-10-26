import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../common/errors/not-found-error';
import { ValidationError } from '../../../common/errors/validation-error';
import { decodeCursor, encodeCursor } from '../domain/post-cursor';
import { POST_INTERACTION_REPOSITORY } from '../domain/post-interaction.repository';
import type {
  CommentView,
  PostInteractionRepository,
} from '../domain/post-interaction.repository';

export const MAX_COMMENT_LENGTH = 500;
export const DEFAULT_COMMENTS_LIMIT = 20;
export const MAX_COMMENTS_LIMIT = 50;

const POST_NOT_FOUND = 'La publicación no existe.';

function presentComment(comment: CommentView) {
  return {
    id: comment.id,
    postId: comment.postId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: comment.author,
  };
}

/** Like / quitar like. Ambos idempotentes: repetirlos no cambia el resultado. */
@Injectable()
export class SetPostLikeUseCase {
  constructor(
    @Inject(POST_INTERACTION_REPOSITORY)
    private readonly interactions: PostInteractionRepository,
  ) {}

  async execute(postId: string, userId: string, liked: boolean) {
    if (!(await this.interactions.isPublished(postId))) {
      throw new NotFoundError(POST_NOT_FOUND);
    }
    const likeCount = liked
      ? await this.interactions.like(postId, userId)
      : await this.interactions.unlike(postId, userId);
    return { liked, likeCount };
  }
}

@Injectable()
export class AddCommentUseCase {
  constructor(
    @Inject(POST_INTERACTION_REPOSITORY)
    private readonly interactions: PostInteractionRepository,
  ) {}

  async execute(postId: string, authorId: string, rawBody: string) {
    const body = rawBody.trim();
    if (!body) {
      throw new ValidationError('Escribe un comentario.', 'COMMENT_EMPTY');
    }
    if (body.length > MAX_COMMENT_LENGTH) {
      throw new ValidationError(
        `El comentario no puede superar ${MAX_COMMENT_LENGTH} caracteres.`,
        'COMMENT_TOO_LONG',
      );
    }
    if (!(await this.interactions.isPublished(postId))) {
      throw new NotFoundError(POST_NOT_FOUND);
    }
    const comment = await this.interactions.addComment({
      postId,
      authorId,
      body,
    });
    return presentComment(comment);
  }
}

@Injectable()
export class ListCommentsUseCase {
  constructor(
    @Inject(POST_INTERACTION_REPOSITORY)
    private readonly interactions: PostInteractionRepository,
  ) {}

  async execute(postId: string, params: { cursor?: string; limit?: number }) {
    if (!(await this.interactions.isPublished(postId))) {
      throw new NotFoundError(POST_NOT_FOUND);
    }
    const limit = Math.min(
      Math.max(params.limit ?? DEFAULT_COMMENTS_LIMIT, 1),
      MAX_COMMENTS_LIMIT,
    );
    const after = params.cursor ? decodeCursor(params.cursor) : null;
    const [slice, total] = await Promise.all([
      this.interactions.listComments(postId, limit, after),
      after ? Promise.resolve(null) : this.interactions.countComments(postId),
    ]);
    return {
      items: slice.items.map(presentComment),
      nextCursor: slice.next ? encodeCursor(slice.next) : null,
      total,
    };
  }
}

@Injectable()
export class DeleteCommentUseCase {
  constructor(
    @Inject(POST_INTERACTION_REPOSITORY)
    private readonly interactions: PostInteractionRepository,
  ) {}

  async execute(commentId: string, userId: string): Promise<void> {
    const removed = await this.interactions.removeComment(commentId, userId);
    // Ajeno, inexistente o ya borrado: misma respuesta, sin revelar cual.
    if (!removed) throw new NotFoundError('El comentario no existe.');
  }
}

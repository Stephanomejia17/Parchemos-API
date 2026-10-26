import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../common/errors/not-found-error';
import { decodeCursor, encodeCursor } from '../domain/post-cursor';
import { POST_MEDIA_STORAGE } from '../domain/post-media-storage';
import type { PostMediaStorage } from '../domain/post-media-storage';
import { POST_REPOSITORY } from '../domain/post.repository';
import type { PostRepository } from '../domain/post.repository';
import { DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from './list-feed.use-case';
import { presentPost } from './post.presenter';

/**
 * Perfil: las publicaciones del propio usuario, con el total para el contador.
 * Con `locationId` solo las de esa sede: el dueño de varias sedes ve el
 * contenido de cada una por separado.
 */
@Injectable()
export class ListMyPostsUseCase {
  constructor(
    @Inject(POST_REPOSITORY) private readonly posts: PostRepository,
    @Inject(POST_MEDIA_STORAGE) private readonly storage: PostMediaStorage,
  ) {}

  async execute(
    userId: string,
    params: { cursor?: string; limit?: number; locationId?: string },
  ) {
    const limit = Math.min(
      Math.max(params.limit ?? DEFAULT_FEED_LIMIT, 1),
      MAX_FEED_LIMIT,
    );
    const after = params.cursor ? decodeCursor(params.cursor) : null;
    const [slice, total] = await Promise.all([
      this.posts.findFeed({
        limit,
        after,
        authorId: userId,
        locationId: params.locationId,
        viewerId: userId,
      }),
      // El total (de todas sus publicaciones) solo se pide en la primera pagina.
      after ? Promise.resolve(null) : this.posts.countByAuthor(userId),
    ]);
    return {
      items: slice.items.map((post) => presentPost(post, this.storage)),
      nextCursor: slice.next ? encodeCursor(slice.next) : null,
      total,
    };
  }
}

@Injectable()
export class DeleteMyPostUseCase {
  constructor(
    @Inject(POST_REPOSITORY) private readonly posts: PostRepository,
  ) {}

  async execute(userId: string, postId: string): Promise<void> {
    const removed = await this.posts.removeByAuthor(postId, userId);
    // Ajena, inexistente o ya retirada: misma respuesta, sin revelar cual.
    if (!removed) throw new NotFoundError('La publicación no existe.');
  }
}

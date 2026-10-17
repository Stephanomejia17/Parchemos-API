import { Inject, Injectable } from '@nestjs/common';
import { decodeCursor, encodeCursor } from '../domain/post-cursor';
import { POST_MEDIA_STORAGE } from '../domain/post-media-storage';
import type { PostMediaStorage } from '../domain/post-media-storage';
import { POST_REPOSITORY } from '../domain/post.repository';
import type { PostRepository } from '../domain/post.repository';
import { presentPost } from './post.presenter';

export const DEFAULT_FEED_LIMIT = 10;
export const MAX_FEED_LIMIT = 50;

@Injectable()
export class ListFeedUseCase {
  constructor(
    @Inject(POST_REPOSITORY) private readonly posts: PostRepository,
    @Inject(POST_MEDIA_STORAGE) private readonly storage: PostMediaStorage,
  ) {}

  async execute(params: { cursor?: string; limit?: number }) {
    const limit = Math.min(
      Math.max(params.limit ?? DEFAULT_FEED_LIMIT, 1),
      MAX_FEED_LIMIT,
    );
    const after = params.cursor ? decodeCursor(params.cursor) : null;
    const slice = await this.posts.findFeed(limit, after);
    return {
      items: slice.items.map((post) => presentPost(post, this.storage)),
      nextCursor: slice.next ? encodeCursor(slice.next) : null,
    };
  }
}

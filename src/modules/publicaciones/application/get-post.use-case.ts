import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../common/errors/not-found-error';
import { POST_MEDIA_STORAGE } from '../domain/post-media-storage';
import type { PostMediaStorage } from '../domain/post-media-storage';
import { POST_REPOSITORY } from '../domain/post.repository';
import type { PostRepository } from '../domain/post.repository';
import { presentPost } from './post.presenter';

@Injectable()
export class GetPostUseCase {
  constructor(
    @Inject(POST_REPOSITORY) private readonly posts: PostRepository,
    @Inject(POST_MEDIA_STORAGE) private readonly storage: PostMediaStorage,
  ) {}

  async execute(id: string) {
    const post = await this.posts.findPublishedById(id);
    // Oculta o eliminada se trata igual que inexistente (CA9).
    if (!post) throw new NotFoundError('La publicación no existe.');
    return presentPost(post, this.storage);
  }
}

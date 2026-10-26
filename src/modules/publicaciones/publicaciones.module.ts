import { Module } from '@nestjs/common';
import { CreatePostUseCase } from './application/create-post.use-case';
import { GetPostUseCase } from './application/get-post.use-case';
import { ListFeedUseCase } from './application/list-feed.use-case';
import {
  AddCommentUseCase,
  DeleteCommentUseCase,
  ListCommentsUseCase,
  SetPostLikeUseCase,
} from './application/post-interactions.use-cases';
import { RegisterPostViewUseCase } from './application/register-post-view.use-case';
import {
  DeleteMyPostUseCase,
  ListMyPostsUseCase,
} from './application/my-posts.use-cases';
import { POST_MEDIA_STORAGE } from './domain/post-media-storage';
import { POST_INTERACTION_REPOSITORY } from './domain/post-interaction.repository';
import { POST_REPOSITORY } from './domain/post.repository';
import { PostInteractionsController } from './infrastructure/http/post-interactions.controller';
import { PrismaPostInteractionRepository } from './infrastructure/persistence/prisma-post-interaction.repository';
import { PublicacionesController } from './infrastructure/http/publicaciones.controller';
import { PrismaPostRepository } from './infrastructure/persistence/prisma-post.repository';
import { SupabasePostMediaStorage } from './infrastructure/storage/supabase-post-media-storage';

@Module({
  controllers: [PublicacionesController, PostInteractionsController],
  providers: [
    CreatePostUseCase,
    ListFeedUseCase,
    GetPostUseCase,
    ListMyPostsUseCase,
    DeleteMyPostUseCase,
    RegisterPostViewUseCase,
    SetPostLikeUseCase,
    AddCommentUseCase,
    ListCommentsUseCase,
    DeleteCommentUseCase,
    { provide: POST_REPOSITORY, useClass: PrismaPostRepository },
    {
      provide: POST_INTERACTION_REPOSITORY,
      useClass: PrismaPostInteractionRepository,
    },
    { provide: POST_MEDIA_STORAGE, useClass: SupabasePostMediaStorage },
  ],
})
export class PublicacionesModule {}

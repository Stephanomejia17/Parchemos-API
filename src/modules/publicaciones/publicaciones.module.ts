import { Module } from '@nestjs/common';
import { CreatePostUseCase } from './application/create-post.use-case';
import { GetPostUseCase } from './application/get-post.use-case';
import { ListFeedUseCase } from './application/list-feed.use-case';
import {
  DeleteMyPostUseCase,
  ListMyPostsUseCase,
} from './application/my-posts.use-cases';
import { POST_MEDIA_STORAGE } from './domain/post-media-storage';
import { POST_REPOSITORY } from './domain/post.repository';
import { PublicacionesController } from './infrastructure/http/publicaciones.controller';
import { PrismaPostRepository } from './infrastructure/persistence/prisma-post.repository';
import { SupabasePostMediaStorage } from './infrastructure/storage/supabase-post-media-storage';

@Module({
  controllers: [PublicacionesController],
  providers: [
    CreatePostUseCase,
    ListFeedUseCase,
    GetPostUseCase,
    ListMyPostsUseCase,
    DeleteMyPostUseCase,
    { provide: POST_REPOSITORY, useClass: PrismaPostRepository },
    { provide: POST_MEDIA_STORAGE, useClass: SupabasePostMediaStorage },
  ],
})
export class PublicacionesModule {}

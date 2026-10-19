import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { CreatePostUseCase } from '../../application/create-post.use-case';
import type { UploadedFile } from '../../application/create-post.use-case';
import { GetPostUseCase } from '../../application/get-post.use-case';
import { ListFeedUseCase } from '../../application/list-feed.use-case';
import { RegisterPostViewUseCase } from '../../application/register-post-view.use-case';
import {
  DeleteMyPostUseCase,
  ListMyPostsUseCase,
} from '../../application/my-posts.use-cases';
import { MAX_POST_MEDIA_FILES } from '../../domain/media-inspector';
import { CreatePostDto, FeedQueryDto } from './publicaciones.dto';
import { postMediaUploadOptions } from './post-media-upload.options';

/**
 * DO-04 (publicar) y DO-03 (explorar). Todo requiere sesion: el JwtAuthGuard
 * global responde 401 sin token (CA10) y el RolesGuard 403 a quien no sea
 * comensal o restaurante al publicar.
 */
@Controller()
export class PublicacionesController {
  constructor(
    private readonly createPost: CreatePostUseCase,
    private readonly listFeed: ListFeedUseCase,
    private readonly getPost: GetPostUseCase,
    private readonly listMyPosts: ListMyPostsUseCase,
    private readonly deleteMyPost: DeleteMyPostUseCase,
    private readonly registerPostView: RegisterPostViewUseCase,
  ) {}

  @Get('feed')
  feed(@Query() query: FeedQueryDto) {
    return this.listFeed.execute({ cursor: query.cursor, limit: query.limit });
  }

  /** Perfil: mis publicaciones. Va antes de `:id` para que "mias" no se lea como uuid. */
  @Get('publicaciones/mias')
  @Roles(Role.COMENSAL, Role.RESTAURANTE)
  mine(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedQueryDto) {
    return this.listMyPosts.execute(user.id, {
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Delete('publicaciones/:id')
  @HttpCode(204)
  @Roles(Role.COMENSAL, Role.RESTAURANTE)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.deleteMyPost.execute(user.id, id);
  }

  @Get('publicaciones/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.getPost.execute(id);
  }

  @Post('publicaciones/:id/vista')
  @HttpCode(204)
  @Roles(Role.COMENSAL, Role.RESTAURANTE)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async registerView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.registerPostView.execute(id, user.id);
  }

  @Post('publicaciones')
  @HttpCode(201)
  @Roles(Role.COMENSAL, Role.RESTAURANTE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FilesInterceptor('files', MAX_POST_MEDIA_FILES, postMediaUploadOptions),
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePostDto,
    @UploadedFiles() files: UploadedFile[] = [],
  ) {
    // El autor sale siempre del token, nunca del cuerpo.
    return this.createPost.execute({
      authorId: user.id,
      files,
      caption: body.caption,
      locationId: body.locationId,
    });
  }
}

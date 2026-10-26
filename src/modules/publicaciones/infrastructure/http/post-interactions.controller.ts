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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import {
  AddCommentUseCase,
  DeleteCommentUseCase,
  ListCommentsUseCase,
  SetPostLikeUseCase,
} from '../../application/post-interactions.use-cases';
import { CommentsQueryDto, CreateCommentDto } from './publicaciones.dto';

/**
 * Likes y comentarios de las publicaciones. Los usan comensales y restaurantes
 * (los que publican); el usuario siempre sale del token.
 */
@Controller()
@Roles(Role.COMENSAL, Role.RESTAURANTE)
export class PostInteractionsController {
  constructor(
    private readonly setLike: SetPostLikeUseCase,
    private readonly addComment: AddCommentUseCase,
    private readonly listComments: ListCommentsUseCase,
    private readonly deleteComment: DeleteCommentUseCase,
  ) {}

  @Post('publicaciones/:id/like')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  like(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.setLike.execute(id, user.id, true);
  }

  @Delete('publicaciones/:id/like')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  unlike(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.setLike.execute(id, user.id, false);
  }

  @Get('publicaciones/:id/comentarios')
  comments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CommentsQueryDto,
  ) {
    return this.listComments.execute(id, {
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Post('publicaciones/:id/comentarios')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  comment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateCommentDto,
  ) {
    return this.addComment.execute(id, user.id, body.body);
  }

  @Delete('comentarios/:commentId')
  @HttpCode(204)
  async removeComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    await this.deleteComment.execute(commentId, user.id);
  }
}

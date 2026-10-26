import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_FEED_LIMIT } from '../../application/list-feed.use-case';
import {
  MAX_COMMENT_LENGTH,
  MAX_COMMENTS_LIMIT,
} from '../../application/post-interactions.use-cases';

export class CreatePostDto {
  /** El CHECK `posts_caption_chk` de la BD permite hasta 1000 caracteres. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  /** Opcional (RN2): `posts.location_id` es nullable. */
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class MyPostsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_FEED_LIMIT)
  limit?: number;

  /** Solo las publicaciones de esta sede (dueño con varias sedes). */
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class CommentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_COMMENTS_LIMIT)
  limit?: number;
}

export class CreateCommentDto {
  @IsString()
  @MaxLength(MAX_COMMENT_LENGTH)
  body!: string;
}

export class FeedQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_FEED_LIMIT)
  limit?: number;
}

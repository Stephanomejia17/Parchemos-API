import type { PostCursor } from './post-cursor';

export const POST_INTERACTION_REPOSITORY = Symbol(
  'POST_INTERACTION_REPOSITORY',
);

export interface CommentView {
  id: string;
  postId: string;
  body: string;
  createdAt: Date;
  author: {
    id: string;
    fullName: string;
    photoUrl: string | null;
    role: string;
  };
}

export interface CommentsSlice {
  items: CommentView[];
  /** Cursor del ultimo comentario de `items`; `null` si no hay mas. */
  next: PostCursor | null;
}

/** Likes y comentarios de las publicaciones. */
export interface PostInteractionRepository {
  /** La publicacion existe y esta `publicada` (oculta o eliminada no admite interaccion). */
  isPublished(postId: string): Promise<boolean>;
  /** Idempotente (PK post+usuario). Devuelve el total de likes ya actualizado. */
  like(postId: string, userId: string): Promise<number>;
  /** Idempotente. Devuelve el total de likes ya actualizado. */
  unlike(postId: string, userId: string): Promise<number>;
  addComment(data: {
    postId: string;
    authorId: string;
    body: string;
  }): Promise<CommentView>;
  /** De la mas reciente a la mas antigua, con cursor (created_at, id). */
  listComments(
    postId: string,
    limit: number,
    after: PostCursor | null,
  ): Promise<CommentsSlice>;
  countComments(postId: string): Promise<number>;
  /**
   * Retira un comentario. Puede hacerlo quien lo escribio o el autor de la
   * publicacion. `false` si no existe o no tiene permiso.
   */
  removeComment(commentId: string, userId: string): Promise<boolean>;
}

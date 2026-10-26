import type { InspectedMediaType } from './media-inspector';
import type { PostCursor } from './post-cursor';

export const POST_REPOSITORY = Symbol('POST_REPOSITORY');

export interface PostMediaView {
  id: string;
  mediaType: InspectedMediaType;
  storageKey: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

/**
 * Sede de la publicacion junto con su marca (restaurante). La sede pertenece a
 * una marca, asi que el contenido siempre queda asociado a las dos.
 */
export interface PostLocationView {
  id: string;
  name: string;
  restaurant: { id: string; businessName: string };
}

export interface PostView {
  id: string;
  caption: string | null;
  createdAt: Date;
  likeCount: number;
  commentCount: number;
  /** Si el usuario que consulta ya le dio like. */
  likedByMe: boolean;
  author: {
    id: string;
    fullName: string;
    photoUrl: string | null;
    role: string;
  };
  location: PostLocationView | null;
  media: PostMediaView[];
}

export interface NewPostMedia {
  mediaType: InspectedMediaType;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  position: number;
}

export interface NewPost {
  authorId: string;
  locationId: string | null;
  caption: string | null;
  media: NewPostMedia[];
}

export interface FeedSlice {
  items: PostView[];
  /** Cursor de la ultima publicacion de `items`; `null` si no hay mas. */
  next: PostCursor | null;
}

export interface FeedQuery {
  limit: number;
  after: PostCursor | null;
  /** Solo las de este autor (perfil). */
  authorId?: string;
  /** Solo las asociadas a esta sede (perfil del restaurante). */
  locationId?: string;
  /** Quien consulta: define `likedByMe`. */
  viewerId?: string;
}

/** Que tan utilizable es una sede para asociarla a una publicacion. */
export type LocationUse = 'ok' | 'not_found' | 'not_owned';

export interface PostRepository {
  /** Crea el post y sus medios en una sola transaccion. */
  create(data: NewPost): Promise<PostView>;
  /** Solo publicaciones `publicada`, de la mas reciente a la mas antigua. */
  findFeed(query: FeedQuery): Promise<FeedSlice>;
  /** Cantidad de publicaciones `publicada` de un autor. */
  countByAuthor(authorId: string): Promise<number>;
  /**
   * El autor retira su publicacion (borrado logico: queda `eliminada` con
   * motivo, como exige `posts_removal_chk`). `false` si no existe, no es suya
   * o ya no esta publicada.
   */
  removeByAuthor(id: string, authorId: string): Promise<boolean>;
  /** `null` si no existe o no esta `publicada` (oculta/eliminada). */
  findPublishedById(id: string, viewerId?: string): Promise<PostView | null>;
  /**
   * Una sede asociable a una publicacion: debe existir y estar activa. Con
   * `ownerId` ademas debe pertenecer a un restaurante de ese dueno.
   */
  checkLocation(locationId: string, ownerId?: string): Promise<LocationUse>;
}

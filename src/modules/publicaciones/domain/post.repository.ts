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

export interface PostView {
  id: string;
  caption: string | null;
  createdAt: Date;
  likeCount: number;
  author: {
    id: string;
    fullName: string;
    photoUrl: string | null;
    role: string;
  };
  location: { id: string; name: string } | null;
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

export interface PostRepository {
  /** Crea el post y sus medios en una sola transaccion. */
  create(data: NewPost): Promise<PostView>;
  /** Solo publicaciones `publicada`, de la mas reciente a la mas antigua. */
  findFeed(limit: number, after: PostCursor | null): Promise<FeedSlice>;
  /** `null` si no existe o no esta `publicada` (oculta/eliminada). */
  findPublishedById(id: string): Promise<PostView | null>;
  /** Una sede asociable a una publicacion: debe existir y estar activa. */
  isActiveLocation(locationId: string): Promise<boolean>;
}

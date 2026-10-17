import type { PostMediaStorage } from '../domain/post-media-storage';
import type { PostView } from '../domain/post.repository';

/** Forma publica de una publicacion; la URL de cada medio se resuelve aqui. */
export function presentPost(post: PostView, storage: PostMediaStorage) {
  return {
    id: post.id,
    caption: post.caption,
    createdAt: post.createdAt.toISOString(),
    likeCount: post.likeCount,
    author: post.author,
    location: post.location,
    media: post.media.map((media) => ({
      id: media.id,
      mediaType: media.mediaType,
      url: storage.urlFor(media.storageKey),
      mimeType: media.mimeType,
      width: media.width,
      height: media.height,
      durationSeconds: media.durationSeconds,
    })),
  };
}

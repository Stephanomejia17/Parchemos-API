import { ValidationError } from '../../../common/errors/validation-error';

/**
 * Cursor opaco del feed (PARCHE-77): codifica `(created_at, id)` de la ultima
 * publicacion entregada. `createdAt` viaja como el texto exacto que devuelve
 * PostgreSQL (microsegundos): pasarlo por `Date` truncaria a milisegundos y
 * podria repetir u omitir publicaciones con el mismo instante.
 */
export interface PostCursor {
  createdAt: string;
  id: string;
}

const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: PostCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString(
    'base64url',
  );
}

export function decodeCursor(raw: string): PostCursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [createdAt, id] = parsed as unknown[];
      if (
        typeof createdAt === 'string' &&
        TIMESTAMP.test(createdAt) &&
        typeof id === 'string' &&
        UUID.test(id)
      ) {
        return { createdAt, id };
      }
    }
  } catch {
    /* cae al error generico de abajo */
  }
  throw new ValidationError('El cursor no es válido.', 'INVALID_CURSOR');
}

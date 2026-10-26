import { NotFoundError } from '../../../common/errors/not-found-error';
import { ValidationError } from '../../../common/errors/validation-error';
import { encodeCursor } from '../domain/post-cursor';
import type {
  CommentView,
  PostInteractionRepository,
} from '../domain/post-interaction.repository';
import {
  AddCommentUseCase,
  DeleteCommentUseCase,
  ListCommentsUseCase,
  SetPostLikeUseCase,
} from './post-interactions.use-cases';

const comment = (id: string): CommentView => ({
  id,
  postId: 'post-1',
  body: `comentario ${id}`,
  createdAt: new Date('2026-10-26T12:00:00Z'),
  author: { id: 'u1', fullName: 'Ana', photoUrl: null, role: 'comensal' },
});

function setup(published = true) {
  const repo = {
    isPublished: jest.fn().mockResolvedValue(published),
    like: jest.fn().mockResolvedValue(3),
    unlike: jest.fn().mockResolvedValue(2),
    addComment: jest
      .fn()
      .mockImplementation(({ body }: { body: string }) =>
        Promise.resolve({ ...comment('c1'), body }),
      ),
    listComments: jest
      .fn()
      .mockResolvedValue({ items: [comment('c1')], next: null }),
    countComments: jest.fn().mockResolvedValue(7),
    removeComment: jest.fn().mockResolvedValue(true),
  };
  return { repo, asRepo: repo as unknown as PostInteractionRepository };
}

describe('SetPostLikeUseCase', () => {
  it('da like y devuelve el total actualizado', async () => {
    const { repo, asRepo } = setup();

    const result = await new SetPostLikeUseCase(asRepo).execute(
      'post-1',
      'u1',
      true,
    );

    expect(repo.like).toHaveBeenCalledWith('post-1', 'u1');
    expect(result).toEqual({ liked: true, likeCount: 3 });
  });

  it('quita el like y devuelve el total actualizado', async () => {
    const { repo, asRepo } = setup();

    const result = await new SetPostLikeUseCase(asRepo).execute(
      'post-1',
      'u1',
      false,
    );

    expect(repo.unlike).toHaveBeenCalledWith('post-1', 'u1');
    expect(result).toEqual({ liked: false, likeCount: 2 });
  });

  it('una publicacion oculta, eliminada o inexistente responde 404', async () => {
    const { repo, asRepo } = setup(false);

    await expect(
      new SetPostLikeUseCase(asRepo).execute('post-1', 'u1', true),
    ).rejects.toThrow(NotFoundError);
    expect(repo.like).not.toHaveBeenCalled();
  });
});

describe('AddCommentUseCase', () => {
  it('guarda el comentario sin espacios sobrantes', async () => {
    const { repo, asRepo } = setup();

    const result = await new AddCommentUseCase(asRepo).execute(
      'post-1',
      'u1',
      '  Qué buena pinta  ',
    );

    expect(repo.addComment).toHaveBeenCalledWith({
      postId: 'post-1',
      authorId: 'u1',
      body: 'Qué buena pinta',
    });
    expect(result.body).toBe('Qué buena pinta');
    expect(result.createdAt).toBe('2026-10-26T12:00:00.000Z');
  });

  it('rechaza un comentario vacio o solo con espacios', async () => {
    const { repo, asRepo } = setup();

    await expect(
      new AddCommentUseCase(asRepo).execute('post-1', 'u1', '   '),
    ).rejects.toThrow(ValidationError);
    expect(repo.addComment).not.toHaveBeenCalled();
  });

  it('rechaza un comentario de mas de 500 caracteres', async () => {
    const { repo, asRepo } = setup();

    await expect(
      new AddCommentUseCase(asRepo).execute('post-1', 'u1', 'a'.repeat(501)),
    ).rejects.toThrow('500');
    expect(repo.addComment).not.toHaveBeenCalled();
  });

  it('no comenta una publicacion que no esta publicada (404)', async () => {
    const { repo, asRepo } = setup(false);

    await expect(
      new AddCommentUseCase(asRepo).execute('post-1', 'u1', 'hola'),
    ).rejects.toThrow(NotFoundError);
    expect(repo.addComment).not.toHaveBeenCalled();
  });
});

describe('ListCommentsUseCase', () => {
  it('la primera pagina incluye el total; las siguientes no', async () => {
    const { repo, asRepo } = setup();
    const useCase = new ListCommentsUseCase(asRepo);
    const cursor = encodeCursor({
      createdAt: '2026-10-26 12:00:00.000000+00',
      id: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    });

    const first = await useCase.execute('post-1', {});
    const next = await useCase.execute('post-1', { cursor });

    expect(first.total).toBe(7);
    expect(next.total).toBeNull();
    expect(repo.countComments).toHaveBeenCalledTimes(1);
  });

  it('acota el limite y rechaza un cursor invalido', async () => {
    const { repo, asRepo } = setup();
    const useCase = new ListCommentsUseCase(asRepo);

    await useCase.execute('post-1', { limit: 9999 });
    expect(repo.listComments).toHaveBeenCalledWith('post-1', 50, null);

    await expect(
      useCase.execute('post-1', { cursor: 'basura' }),
    ).rejects.toThrow('El cursor no es válido.');
  });

  it('una publicacion no publicada responde 404', async () => {
    const { asRepo } = setup(false);

    await expect(
      new ListCommentsUseCase(asRepo).execute('post-1', {}),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('DeleteCommentUseCase', () => {
  it('lo retira quien tiene permiso', async () => {
    const { repo, asRepo } = setup();

    await new DeleteCommentUseCase(asRepo).execute('c1', 'u1');

    expect(repo.removeComment).toHaveBeenCalledWith('c1', 'u1');
  });

  it('si no existe o no es suyo responde 404 sin revelar cual', async () => {
    const { repo, asRepo } = setup();
    repo.removeComment.mockResolvedValue(false);

    await expect(
      new DeleteCommentUseCase(asRepo).execute('c1', 'intruso'),
    ).rejects.toThrow(NotFoundError);
  });
});

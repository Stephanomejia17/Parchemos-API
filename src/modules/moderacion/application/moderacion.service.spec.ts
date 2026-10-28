import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { SupabaseStorageService } from '../../../infrastructure/storage/supabase-storage.service';
import { ModeracionService } from './moderacion.service';

function setup() {
  const tx = {
    post: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'post-1', authorId: 'autor' }),
      update: jest.fn().mockResolvedValue({}),
    },
    contentReport: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'rep-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    notification: {
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new ModeracionService(
    prisma as unknown as PrismaService,
    {} as SupabaseStorageService,
  );
  return { service, tx };
}

type Aviso = { userId: string; type: string; body: string };

/** `data` de la primera llamada a un metodo de Prisma simulado. */
const datosDe = (mock: jest.Mock): Record<string, unknown> =>
  (mock.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

const notificados = (tx: ReturnType<typeof setup>['tx']): Aviso[] => [
  ...(tx.notification.create.mock.calls as [{ data: Aviso }][]).map(
    ([arg]) => arg.data,
  ),
  ...(tx.notification.createMany.mock.calls as [{ data: Aviso[] }][]).flatMap(
    ([arg]) => arg.data,
  ),
];

describe('ModeracionService.removePost', () => {
  it('elimina la publicación y avisa al autor y a cada denunciante una vez', async () => {
    const { service, tx } = setup();
    tx.contentReport.findMany.mockResolvedValue([
      { reporterId: 'ana' },
      { reporterId: 'luis' },
      { reporterId: 'ana' },
    ]);

    await expect(
      service.removePost('post-1', 'admin', ' Contenido ofensivo '),
    ).resolves.toEqual({
      id: 'post-1',
      status: 'eliminada',
    });

    expect(datosDe(tx.post.update)).toMatchObject({
      status: 'eliminada',
      removalReason: 'Contenido ofensivo',
    });
    expect(datosDe(tx.contentReport.updateMany)).toMatchObject({
      status: 'resuelto',
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
    const avisos = notificados(tx);
    expect(avisos).toEqual([
      expect.objectContaining({
        userId: 'autor',
        type: 'moderation_post_removed',
      }),
      expect.objectContaining({
        userId: 'ana',
        type: 'moderation_report_resolved',
      }),
      expect.objectContaining({
        userId: 'luis',
        type: 'moderation_report_resolved',
      }),
    ]);
    expect(avisos[1].body).toContain('Contenido ofensivo');
  });

  it('no crea avisos de denuncia si no había denuncias pendientes', async () => {
    const { service, tx } = setup();

    await service.removePost('post-1', 'admin', 'Spam');

    expect(tx.notification.createMany).not.toHaveBeenCalled();
    expect(notificados(tx)).toHaveLength(1);
  });

  it('exige un motivo', async () => {
    const { service, tx } = setup();
    await expect(service.removePost('post-1', 'admin', '  ')).rejects.toThrow(
      'obligatorio',
    );
    expect(tx.post.update).not.toHaveBeenCalled();
  });
});

describe('ModeracionService.reviewReport', () => {
  const denuncia = {
    id: 'rep-1',
    postId: 'post-1',
    reporterId: 'ana',
    post: { authorId: 'autor', status: 'publicada' },
  };

  it('rechaza la denuncia y avisa al denunciante y, si era la última, al dueño', async () => {
    const { service, tx } = setup();
    tx.contentReport.findFirst.mockResolvedValue(denuncia);

    await service.reviewReport('rep-1', 'admin', ' No infringe las normas ');

    expect(datosDe(tx.contentReport.update)).toMatchObject({
      status: 'descartado',
      resolutionNote: 'No infringe las normas',
    });
    expect(notificados(tx)).toEqual([
      expect.objectContaining({
        userId: 'ana',
        type: 'moderation_report_dismissed',
      }),
      expect.objectContaining({
        userId: 'autor',
        type: 'moderation_post_kept',
      }),
    ]);
  });

  it('no avisa al dueño mientras queden otras denuncias pendientes', async () => {
    const { service, tx } = setup();
    tx.contentReport.findFirst.mockResolvedValue(denuncia);
    tx.contentReport.count.mockResolvedValue(2);

    await service.reviewReport('rep-1', 'admin', 'No infringe');

    expect(notificados(tx)).toEqual([
      expect.objectContaining({
        userId: 'ana',
        type: 'moderation_report_dismissed',
      }),
    ]);
  });

  it('no avisa al dueño si su publicación ya no está publicada', async () => {
    const { service, tx } = setup();
    tx.contentReport.findFirst.mockResolvedValue({
      ...denuncia,
      post: { authorId: 'autor', status: 'eliminada' },
    });

    await service.reviewReport('rep-1', 'admin', 'No infringe');

    expect(notificados(tx).map((n) => n.userId)).toEqual(['ana']);
  });

  it('falla sin notificar si la denuncia ya fue revisada', async () => {
    const { service, tx } = setup();
    tx.contentReport.findFirst.mockResolvedValue(null);

    await expect(service.reviewReport('rep-1', 'admin', 'x')).rejects.toThrow(
      'ya fue revisada',
    );
    expect(notificados(tx)).toHaveLength(0);
  });
});

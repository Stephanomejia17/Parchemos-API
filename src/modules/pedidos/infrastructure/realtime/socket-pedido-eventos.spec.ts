import { Logger } from '@nestjs/common';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';
import { makePedido } from '../../application/use-cases/pedido.test-helpers';
import type { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import type { PedidosGateway } from './pedidos.gateway';
import { SocketPedidoEventos } from './socket-pedido-eventos';

// El gateway real autentica con Supabase; aqui solo importa que se le llame.
jest.mock('./pedidos.gateway', () => ({
  EVENTO_ESTADO_PEDIDO: 'pedido.estado',
  PedidosGateway: class {},
}));

function setup(
  notificationCreate = jest.fn().mockResolvedValue({ id: 'n-1' }),
) {
  const gateway = { emitirAUsuario: jest.fn() };
  const prisma = { notification: { create: notificationCreate } };
  const eventos = new SocketPedidoEventos(
    gateway as unknown as PedidosGateway,
    prisma as unknown as PrismaService,
  );
  return { gateway, notificationCreate, eventos };
}

describe('SocketPedidoEventos', () => {
  it('guarda la notificación y la emite al comensal', async () => {
    const { gateway, notificationCreate, eventos } = setup();
    const pedido = makePedido({ estado: PedidoEstado.LISTO });

    await eventos.estadoActualizado({
      pedido,
      estadoAnterior: PedidoEstado.EN_PREPARACION,
      autorId: 'staff-1',
    });

    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'comensal-1',
          body: '¡Tu pedido está listo!',
          entityId: 'pedido-1',
        }) as unknown,
      }),
    );
    expect(gateway.emitirAUsuario).toHaveBeenCalledWith(
      'comensal-1',
      'pedido.estado',
      expect.objectContaining({
        id: 'pedido-1',
        estado: PedidoEstado.LISTO,
        estadoAnterior: PedidoEstado.EN_PREPARACION,
        notificacionId: 'n-1',
      }),
    );
  });

  it('no avisa al comensal de un cambio que hizo él mismo', async () => {
    const { gateway, notificationCreate, eventos } = setup();

    await eventos.estadoActualizado({
      pedido: makePedido(),
      estadoAnterior: PedidoEstado.BORRADOR,
      autorId: 'comensal-1',
    });

    expect(notificationCreate).not.toHaveBeenCalled();
    expect(gateway.emitirAUsuario).not.toHaveBeenCalled();
  });

  it('un fallo al notificar no se propaga', async () => {
    const { gateway, eventos } = setup(
      jest.fn().mockRejectedValue(new Error('db caída')),
    );
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(
      eventos.estadoActualizado({
        pedido: makePedido({ estado: PedidoEstado.LISTO }),
        estadoAnterior: PedidoEstado.PENDIENTE,
        autorId: 'staff-1',
      }),
    ).resolves.toBeUndefined();
    expect(gateway.emitirAUsuario).not.toHaveBeenCalled();
  });
});

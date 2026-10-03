import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { SupabaseAuthService } from '../../../../infrastructure/auth/supabase-auth.service';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

export const EVENTO_ESTADO_PEDIDO = 'pedido.estado';

export function salaDeUsuario(userId: string): string {
  return `usuario:${userId}`;
}

/**
 * Canal en tiempo real de pedidos (namespace /pedidos). El cliente se conecta
 * con `auth: { token }` (el mismo access token de la API) y queda suscrito a
 * su sala personal, por donde recibe los cambios de estado de sus pedidos.
 */
@WebSocketGateway({ cors: true, namespace: 'pedidos' })
export class PedidosGateway implements OnGatewayConnection {
  private readonly logger = new Logger(PedidosGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const userId = await this.autenticar(client);
    if (!userId) {
      client.emit('error', { message: 'Sesión expirada o no válida.' });
      client.disconnect(true);
      return;
    }
    await client.join(salaDeUsuario(userId));
  }

  emitirAUsuario(userId: string, evento: string, payload: unknown): void {
    this.server.to(salaDeUsuario(userId)).emit(evento, payload);
  }

  private async autenticar(client: Socket): Promise<string | null> {
    const token = (client.handshake.auth as { token?: unknown })?.token;
    if (typeof token !== 'string' || !token) return null;
    try {
      const authUser = await this.supabaseAuth.verifyAccessToken(token);
      const user = await this.prisma.user.findUnique({
        where: { id: authUser.id },
        select: { id: true, status: true },
      });
      return user && user.status === 'activa' ? user.id : null;
    } catch (error) {
      this.logger.debug(
        `Conexion rechazada: ${error instanceof Error ? error.message : 'token invalido'}`,
      );
      return null;
    }
  }
}

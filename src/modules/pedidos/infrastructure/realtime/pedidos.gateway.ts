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
export const EVENTO_PEDIDO_NUEVO = 'pedido.nuevo';

export function salaDeUsuario(userId: string): string {
  return `usuario:${userId}`;
}

export function salaDeSede(sedeId: string): string {
  return `sede:${sedeId}`;
}

interface UsuarioConectado {
  id: string;
  role: string;
}

/**
 * Canal en tiempo real de pedidos (namespace /pedidos). El cliente se conecta
 * con `auth: { token }` (el mismo access token de la API) y queda suscrito a
 * su sala personal, por donde recibe los cambios de estado de sus pedidos.
 * El personal y los dueños quedan además en la sala de cada sede que
 * gestionan, por donde llegan los pedidos nuevos (GP-05).
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
    const user = await this.autenticar(client);
    if (!user) {
      client.emit('error', { message: 'Sesión expirada o no válida.' });
      client.disconnect(true);
      return;
    }
    const sedes = await this.sedesGestionadas(user);
    await client.join([salaDeUsuario(user.id), ...sedes.map(salaDeSede)]);
  }

  emitirAUsuario(userId: string, evento: string, payload: unknown): void {
    this.server.to(salaDeUsuario(userId)).emit(evento, payload);
  }

  emitirASede(sedeId: string, evento: string, payload: unknown): void {
    this.server.to(salaDeSede(sedeId)).emit(evento, payload);
  }

  /** Sedes cuyos pedidos puede gestionar el usuario (las mismas reglas del REST). */
  private async sedesGestionadas(user: UsuarioConectado): Promise<string[]> {
    if (user.role === 'personal_restaurante') {
      const asignaciones = await this.prisma.restaurantStaff.findMany({
        where: { userId: user.id, isActive: true, revokedAt: null },
        select: { locationId: true },
      });
      return asignaciones.map((a) => a.locationId);
    }
    if (user.role === 'restaurante') {
      const sedes = await this.prisma.location.findMany({
        where: { restaurant: { ownerId: user.id } },
        select: { id: true },
      });
      return sedes.map((s) => s.id);
    }
    return [];
  }

  private async autenticar(client: Socket): Promise<UsuarioConectado | null> {
    const token = (client.handshake.auth as { token?: unknown })?.token;
    if (typeof token !== 'string' || !token) return null;
    try {
      const authUser = await this.supabaseAuth.verifyAccessToken(token);
      const user = await this.prisma.user.findUnique({
        where: { id: authUser.id },
        select: { id: true, role: true, status: true },
      });
      return user && user.status === 'activa'
        ? { id: user.id, role: user.role }
        : null;
    } catch (error) {
      this.logger.debug(
        `Conexion rechazada: ${error instanceof Error ? error.message : 'token invalido'}`,
      );
      return null;
    }
  }
}

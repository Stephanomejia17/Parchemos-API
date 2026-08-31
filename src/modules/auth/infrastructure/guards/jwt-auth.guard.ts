import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../security/token.service';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

/**
 * Guard global: todo endpoint exige un access token valido salvo que este
 * marcado con @Public(). Asi una ruta nueva nace protegida por omision
 * (GU-02 Esc. 6).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('No hay sesión activa.');
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      // GU-05: invalidar sesiones de refresh no basta cuando todavía existe un
      // access token. El estado actual de la cuenta decide cada operación.
      const account = await this.prisma.user.findUnique({
        where: { id: payload.sub }, select: { status: true },
      });
      if (!account || account.status === 'deshabilitada' || account.status === 'suspendida') {
        throw new ForbiddenException('Tu acceso fue deshabilitado.');
      }
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        status: payload.status,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Sesión expirada o no válida.');
    }
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

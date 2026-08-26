import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '../enums/role.enum';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  status: string;
}

/** Inyecta el usuario que el JwtAuthGuard puso en la peticion. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);

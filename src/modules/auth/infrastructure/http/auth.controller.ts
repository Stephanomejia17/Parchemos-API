import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Public } from '../../../../common/decorators/public.decorator';
import { AuthResult } from '../../application/dto/auth-response.dto';
import { LoginDto } from '../../application/dto/login.dto';
import { RegisterDto } from '../../application/dto/register.dto';
import {
  LoginUseCase,
  RequestContext,
  toPublicUser,
} from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case';
import { RequestPasswordResetUseCase } from '../../application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../application/use-cases/reset-password.use-case';
import { ForgotPasswordDto } from '../../application/dto/forgot-password.dto';
import { ResetPasswordDto } from '../../application/dto/reset-password.dto';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';

/** Nombre de la cookie httpOnly que transporta el refresh token. */
const REFRESH_COOKIE = 'parchemos_rt';

/**
 * Ruta de la cookie. Incluye el prefijo global de la API ('api', ver main.ts):
 * si no coincide con la URL real, el navegador simplemente no la envia y la
 * sesion no sobrevive a un F5.
 */
const REFRESH_COOKIE_PATH = '/api/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly login: LoginUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly logout: LogoutUseCase,
    private readonly requestPasswordReset: RequestPasswordResetUseCase,
    private readonly resetPassword: ResetPasswordUseCase,
    private readonly config: ConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /**
   * GU-01 - Registro. No inicia sesion: segun el criterio de aceptacion, tras
   * un registro correcto el usuario es enviado a la pantalla de login.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    const user = await this.registerUser.execute(dto);
    return {
      user: toPublicUser(user),
      message: user.isPendingApproval()
        ? 'Cuenta creada. Queda pendiente de aprobación: ya puedes crear tu perfil de negocio, pero pedidos y reservas siguen bloqueados.'
        : 'Cuenta creada. Ya puedes iniciar sesión.',
      nextStep: 'login',
    };
  }

  /** GU-02 Esc. 1 a 4 - Inicio de sesion. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async loginHandler(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.login.execute(dto, contextOf(req));
    return this.respondWithSession(res, result);
  }

  /** Renueva el access token usando la cookie httpOnly. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const result = await this.refreshSession.execute(token, contextOf(req));
    return this.respondWithSession(res, result);
  }

  /** GU-02 Esc. 5 - Cierre de sesion: invalida el token y borra la cookie. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutHandler(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.logout.execute(
      req.cookies?.[REFRESH_COOKIE] as string | undefined,
    );
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions(0));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
  ) {
    await this.requestPasswordReset.execute(dto.email, contextOf(req));
    return {
      message: 'Si el correo está registrado, recibirás un enlace de recuperación.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPasswordHandler(@Body() dto: ResetPasswordDto) {
    await this.resetPassword.execute(dto.token, dto.password);
  }

  /** Datos del usuario autenticado; el front lo usa para pintar la sesion. */
  @Get('me')
  async me(@CurrentUser() current: AuthenticatedUser) {
    const user = await this.users.findById(current.id);
    if (!user) {
      throw new NotFoundException('La cuenta ya no existe.');
    }
    return { user: toPublicUser(user) };
  }

  private respondWithSession(res: Response, result: AuthResult) {
    res.cookie(
      REFRESH_COOKIE,
      result.refreshToken,
      this.cookieOptions(result.refreshTokenMaxAgeMs),
    );
    return {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    };
  }

  /**
   * El refresh token nunca queda accesible para JavaScript: si hubiera un XSS
   * en el front, no se lo puede robar.
   */
  private cookieOptions(maxAge: number) {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? ('none' as const) : ('lax' as const),
      path: REFRESH_COOKIE_PATH,
      maxAge,
    };
  }
}

function contextOf(req: Request): RequestContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

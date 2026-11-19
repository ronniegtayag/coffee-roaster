import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env';
import type { AuthUser } from './auth-user';
import { AuthService, IssuedSession } from './auth.service';
import {
  clearRefreshCookie,
  readCookie,
  REFRESH_COOKIE,
  RefreshCookieOptions,
  setRefreshCookie,
} from './cookies';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { CsrfHeaderGuard } from './guards/csrf-header.guard';
import { LoginDto } from './dto/login.dto';
import { SessionDto, UserDto } from './dto/session.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookieOptions: RefreshCookieOptions;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieOptions = {
      sameSite: config.get('AUTH_COOKIE_SAMESITE', { infer: true }),
      secure: config.get('AUTH_COOKIE_SECURE', { infer: true }),
    };
  }

  @Public()
  @Post('login')
  @UseGuards(CsrfHeaderGuard)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Log in with email and password; sets the refresh cookie (requires X-Requested-With)',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    const issued = await this.auth.login(
      dto.email,
      dto.password,
      req.ip ?? 'unknown',
      req.headers['user-agent'],
    );
    return this.respond(res, issued);
  }

  @Public()
  @Post('refresh')
  @UseGuards(CsrfHeaderGuard)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Issue a new access token from the refresh cookie (requires X-Requested-With)',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    try {
      const issued = await this.auth.refresh(readCookie(req, REFRESH_COOKIE));
      return this.respond(res, issued);
    } catch (err) {
      clearRefreshCookie(res, this.cookieOptions);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @UseGuards(CsrfHeaderGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current session (requires X-Requested-With)' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readCookie(req, REFRESH_COOKIE));
    clearRefreshCookie(res, this.cookieOptions);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The current user and their permissions' })
  me(@CurrentUser() user: AuthUser): UserDto {
    return this.auth.toUserDto(user);
  }

  private respond(res: Response, issued: IssuedSession): SessionDto {
    setRefreshCookie(res, issued.refreshToken, issued.cookieMaxAgeSeconds, this.cookieOptions);
    return issued.body;
  }
}

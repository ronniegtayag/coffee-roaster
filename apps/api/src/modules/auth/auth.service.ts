import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../../config/env';
import { apiError } from '../../common/api-error';
import type { User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from './auth-user';
import { LoginThrottleService } from './login-throttle.service';
import { hashPassword, verifyPassword } from './password';
import { permissionsForRole } from './permissions';
import type { SessionDto, UserDto } from './dto/session.dto';

export interface IssuedSession {
  body: SessionDto;
  /** Raw refresh token for the cookie; only its hash is stored. */
  refreshToken: string;
  /** Seconds until the session (and cookie) expires. */
  cookieMaxAgeSeconds: number;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export function toAuthUser(user: Pick<User, 'id' | 'email' | 'name' | 'role'>): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: permissionsForRole(user.role),
  };
}

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly throttle: LoginThrottleService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Verified against when the email is unknown, so timing does not reveal which accounts exist.
    this.dummyHash = await hashPassword(randomBytes(16).toString('hex'));
  }

  async login(
    email: string,
    password: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<IssuedSession> {
    const normalised = email.trim().toLowerCase();

    const retryAfter = this.throttle.retryAfterSeconds(normalised, ip);
    if (retryAfter > 0) {
      throw apiError(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Try again later.', {
        headers: { 'Retry-After': String(retryAfter) },
        meta: { retryAfterSeconds: retryAfter },
      });
    }

    const user = await this.prisma.user.findUnique({ where: { email: normalised } });
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? this.dummyHash);
    if (!user || !passwordOk || !user.isActive) {
      this.throttle.recordFailure(normalised, ip);
      throw apiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    this.throttle.recordSuccess(normalised);

    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get('AUTH_SESSION_TTL_HOURS', { infer: true }) * 3_600_000,
    );
    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt,
        userAgent: userAgent?.slice(0, 255) ?? null,
      },
    });
    return this.issue(user, refreshToken, expiresAt);
  }

  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    const expired = () => apiError(401, 'SESSION_EXPIRED', 'Your session has expired');
    if (!refreshToken) throw expired();

    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now) throw expired();
    if (!session.user.isActive) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      throw expired();
    }
    await this.prisma.authSession.update({ where: { id: session.id }, data: { lastUsedAt: now } });
    return this.issue(session.user, refreshToken, session.expiresAt);
  }

  /** Revokes the session for this refresh token. Idempotent. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.authSession.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Verifies an access token and loads the user, so deactivation applies on the next request. */
  async authenticate(accessToken: string): Promise<AuthUser> {
    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(accessToken, {
        algorithms: ['HS256'],
      });
      if (!payload.sub) throw new Error('no sub');
      sub = payload.sub;
    } catch {
      throw this.unauthenticated();
    }
    const user = await this.prisma.user.findUnique({ where: { id: sub } }).catch(() => null);
    if (!user || !user.isActive) throw this.unauthenticated();
    return toAuthUser(user);
  }

  toUserDto(user: AuthUser): UserDto {
    return { ...user };
  }

  unauthenticated() {
    return apiError(401, 'UNAUTHENTICATED', 'Log in to continue');
  }

  private async issue(user: User, refreshToken: string, expiresAt: Date): Promise<IssuedSession> {
    // Never outlive the session.
    const expiresIn = Math.max(
      1,
      Math.min(
        this.config.get('JWT_EXPIRES_IN_SECONDS', { infer: true }),
        Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      ),
    );
    const accessToken = await this.jwt.signAsync({ sub: user.id }, { expiresIn });
    return {
      refreshToken,
      cookieMaxAgeSeconds: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      body: {
        accessToken,
        expiresIn,
        sessionExpiresAt: expiresAt.toISOString(),
        user: this.toUserDto(toAuthUser(user)),
      },
    };
  }
}

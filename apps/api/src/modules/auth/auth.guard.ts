import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { IS_PUBLIC_KEY } from './public.decorator';
import { UsersService } from '../users/users.service';
import type { RequestUser } from '../../common/request-user';

type HttpRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: RequestUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const identity = await this.resolveIdentity(request);
    const profile = await this.users.ensureProfile(identity);

    request.user = {
      id: profile.id,
      authUserId: profile.authUserId,
      email: profile.email,
      displayName: profile.displayName,
    };

    return true;
  }

  private async resolveIdentity(request: HttpRequest) {
    const devAuthUserId = this.header(request, 'x-dev-auth-user-id');
    if (process.env.NODE_ENV !== 'production' && this.config.get<string>('DEV_AUTH_ENABLED') === 'true' && devAuthUserId) {
      return {
        authUserId: devAuthUserId,
        email: this.header(request, 'x-dev-auth-email') ?? `${devAuthUserId}@local.test`,
        displayName: this.header(request, 'x-dev-auth-name') ?? 'Local User',
      };
    }

    const authorization = this.header(request, 'authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const jwksUrl = this.config.get<string>('SUPABASE_JWKS_URL');
    if (!jwksUrl) {
      throw new UnauthorizedException('SUPABASE_JWKS_URL is not configured');
    }

    this.jwks ??= createRemoteJWKSet(new URL(jwksUrl));
    const issuer = this.config.get<string>('SUPABASE_JWT_ISSUER') || undefined;
    const { payload } = await jwtVerify(token, this.jwks, issuer ? { issuer } : undefined);
    return this.payloadToIdentity(payload);
  }

  private payloadToIdentity(payload: JWTPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Token subject is missing');
    }

    const metadata = payload.user_metadata;
    const displayName =
      metadata && typeof metadata === 'object' && 'full_name' in metadata
        ? String(metadata.full_name)
        : undefined;

    return {
      authUserId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      displayName,
    };
  }

  private header(request: HttpRequest, name: string) {
    const value = request.headers[name] ?? request.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}

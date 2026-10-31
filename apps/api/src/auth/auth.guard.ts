import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CryptoService, type JwtPayload } from '../common/crypto.service';
import { StoreService, type StoredApiKey } from '../common/store.service';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  apiKey?: StoredApiKey;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(StoreService) private readonly store: StoreService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawHeaderKey = req.headers['x-api-key'];
    const xApiKey =
      typeof rawHeaderKey === 'string'
        ? rawHeaderKey.trim()
        : Array.isArray(rawHeaderKey)
          ? rawHeaderKey[0]?.trim()
          : undefined;

    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

    const candidateApiKey =
      xApiKey ?? (bearerToken?.startsWith('dp_live_') ? bearerToken : undefined);

    if (candidateApiKey) {
      const verifiedKey = this.store.verifyApiKey(candidateApiKey);
      if (!verifiedKey) {
        throw new UnauthorizedException(
          'Invalid or revoked API key. Generate a new key in Workspace -> API Keys.',
        );
      }
      req.apiKey = verifiedKey;
      req.user = {
        sub: verifiedKey.createdByUserId,
        email: 'api-key@datapilot.ai',
        orgId: verifiedKey.organizationId,
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      return true;
    }

    const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[
      'dp_access_token'
    ];
    const token = cookieToken ?? bearerToken;
    if (!token) {
      throw new UnauthorizedException(
        'Session expired or missing. Provide a valid JWT or x-api-key header.',
      );
    }

    const payload = this.crypto.verifyJwt(token, 'access');
    if (!payload) {
      throw new UnauthorizedException(
        'Access token is invalid or expired. Refresh your session or sign in again.',
      );
    }

    req.user = payload;
    return true;
  }
}


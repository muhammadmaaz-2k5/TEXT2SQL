import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthSessionResponse, AuthUser } from '@datapilot/types';
import { CryptoService } from '../common/crypto.service';
import { StoreService, type StoredUser } from '../common/store.service';
import type { LoginDto, SignupDto } from './auth.dto';

export interface IssuedAuthTokens {
  session: AuthSessionResponse;
  refreshToken: string;
  refreshMaxAgeMs: number;
  accessMaxAgeMs: number;
}

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds = 15 * 60; // 15 minutes
  private readonly refreshTtlSeconds = 7 * 24 * 60 * 60; // 7 days

  constructor(
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
  ) {}

  private issueTokensForUser(user: StoredUser): IssuedAuthTokens {
    const authUser = this.store.buildAuthUser(user);
    const accessToken = this.crypto.signJwt(
      {
        sub: authUser.id,
        email: authUser.email,
        orgId: authUser.activeOrganizationId,
        type: 'access',
      },
      this.accessTtlSeconds,
    );

    const refreshToken = this.crypto.signJwt(
      {
        sub: authUser.id,
        email: authUser.email,
        orgId: authUser.activeOrganizationId,
        type: 'refresh',
      },
      this.refreshTtlSeconds,
    );

    const refreshMaxAgeMs = this.refreshTtlSeconds * 1000;
    const accessMaxAgeMs = this.accessTtlSeconds * 1000;

    this.store.saveRefreshToken(authUser.id, refreshToken, Date.now() + refreshMaxAgeMs);

    return {
      session: {
        user: authUser,
        accessToken,
        expiresIn: this.accessTtlSeconds,
      },
      refreshToken,
      refreshMaxAgeMs,
      accessMaxAgeMs,
    };
  }

  login(dto: LoginDto): IssuedAuthTokens {
    const user = this.store.findUserByEmail(dto.email);
    if (!user || !this.crypto.verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException(
        'Email or password did not match any account. Check your credentials or use the demo workspace.',
      );
    }
    return this.issueTokensForUser(user);
  }

  loginDemo(): IssuedAuthTokens {
    const demoUser = this.store.findUserByEmail('pilot@datapilot.ai');
    if (!demoUser) {
      throw new NotFoundException('Demo account is not initialized.');
    }
    return this.issueTokensForUser(demoUser);
  }

  signup(dto: SignupDto): IssuedAuthTokens {
    const existing = this.store.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists. Sign in or reset your password.',
      );
    }

    const passwordHash = this.crypto.hashPassword(dto.password);
    const authUser = this.store.createUserWithOrganization({
      name: dto.name,
      email: dto.email,
      passwordHash,
      organizationName: dto.organizationName,
    });

    const createdUser = this.store.findUserById(authUser.id);
    if (!createdUser) {
      throw new NotFoundException('Account creation failed.');
    }

    return this.issueTokensForUser(createdUser);
  }

  refresh(refreshToken: string | undefined): IssuedAuthTokens {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token found. Sign in to continue.');
    }
    const payload = this.crypto.verifyJwt(refreshToken, 'refresh');
    if (!payload) {
      throw new UnauthorizedException('Refresh token expired. Sign in again.');
    }
    const user = this.store.consumeRefreshToken(refreshToken);
    if (!user) {
      throw new UnauthorizedException('Refresh session is no longer active. Sign in again.');
    }
    return this.issueTokensForUser(user);
  }

  logout(refreshToken: string | undefined): void {
    if (refreshToken) {
      this.store.revokeRefreshToken(refreshToken);
    }
  }

  getProfile(userId: string): AuthUser {
    const user = this.store.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('Account not found.');
    }
    return this.store.buildAuthUser(user);
  }

  switchOrganization(userId: string, organizationId: string): IssuedAuthTokens {
    const updatedAuthUser = this.store.switchActiveOrganization(userId, organizationId);
    if (!updatedAuthUser) {
      throw new ForbiddenException(
        'You do not have access to the selected organization.',
      );
    }
    const user = this.store.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('Account not found.');
    }
    return this.issueTokensForUser(user);
  }
}


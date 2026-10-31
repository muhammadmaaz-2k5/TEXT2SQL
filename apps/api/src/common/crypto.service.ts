import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export interface JwtPayload {
  sub: string;
  email: string;
  orgId: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

@Injectable()
export class CryptoService {
  private readonly encryptionKey: Buffer;
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor() {
    const rawKey =
      process.env.CREDENTIAL_ENCRYPTION_KEY ??
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    this.encryptionKey =
      rawKey.length === 64
        ? Buffer.from(rawKey, 'hex')
        : scryptSync(rawKey, 'datapilot-aes-salt', 32);

    this.accessSecret =
      process.env.JWT_ACCESS_SECRET ?? 'dp_jwt_access_secret_change_in_production_2026';
    this.refreshSecret =
      process.env.JWT_REFRESH_SECRET ?? 'dp_jwt_refresh_secret_change_in_production_2026';
  }

  /**
   * Encrypts sensitive credentials (like DB passwords) using AES-256-GCM.
   */
  encryptCredential(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypts AES-256-GCM encrypted credentials.
   */
  decryptCredential(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new Error('Malformed encrypted credential payload.');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  verifyPassword(password: string, storedHash: string): boolean {
    const [salt, keyHex] = storedHash.split(':');
    if (!salt || !keyHex) return false;
    const keyBuffer = Buffer.from(keyHex, 'hex');
    const derivedBuffer = scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedBuffer.length) return false;
    return timingSafeEqual(keyBuffer, derivedBuffer);
  }

  signJwt(
    payload: Omit<JwtPayload, 'iat' | 'exp'>,
    expiresInSeconds: number,
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload: JwtPayload = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
    };
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    );
    const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const secret = payload.type === 'access' ? this.accessSecret : this.refreshSecret;
    const signature = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    return `${headerB64}.${payloadB64}.${signature}`;
  }

  verifyJwt(token: string, expectedType: 'access' | 'refresh'): JwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
      const [headerB64, payloadB64, signatureB64] = parts;
      const secret = expectedType === 'access' ? this.accessSecret : this.refreshSecret;
      const expectedSig = createHmac('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      const sigBuf = Buffer.from(signatureB64);
      const expectedBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
        return null;
      }

      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      ) as JwtPayload;
      const now = Math.floor(Date.now() / 1000);
      if (payload.type !== expectedType || payload.exp <= now) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }
}


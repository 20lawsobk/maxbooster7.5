import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { storage } from '../storage';
import type { InsertJWTToken, InsertRefreshToken } from '@shared/schema';
import { logger } from '../logger.js';

let JWT_SECRET = process.env.SESSION_SECRET || '';

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }

  logger.warn(
    '⚠️  SESSION_SECRET not set - using development fallback. Set SESSION_SECRET for production!'
  );
  JWT_SECRET = 'dev-secret-' + crypto.createHash('sha256').update('maxbooster-dev').digest('hex');
}

const ACCESS_TOKEN_EXPIRY = '15m';
const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REVOKED_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenId: string;
  refreshTokenId: string;
  expiresAt: Date;
  refreshTokenExpiresAt: Date;
}

interface RotatedTokenResult {
  accessToken: string;
  refreshToken: string;
  accessTokenId: string;
  refreshTokenId: string;
  expiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export class JWTAuthService {
  private userTokenVersions: Map<string, number> = new Map();

  async getUserTokenVersion(userId: string): Promise<number> {
    const user = await storage.getUser(userId);
    return (user as any)?.tokenVersion || 0;
  }

  async incrementUserTokenVersion(userId: string): Promise<number> {
    const currentVersion = await this.getUserTokenVersion(userId);
    const newVersion = currentVersion + 1;
    await storage.updateUser(userId, { tokenVersion: newVersion } as any);
    return newVersion;
  }

  async issueTokens(userId: string, role: string = 'user'): Promise<TokenPair> {
    const accessTokenId = crypto.randomUUID();
    const refreshTokenId = crypto.randomUUID();
    const refreshTokenValue = crypto.randomBytes(32).toString('hex');
    const tokenVersion = await this.getUserTokenVersion(userId);

    const accessTokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS);
    const refreshTokenExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    const accessToken = jwt.sign(
      {
        sub: userId,
        jti: accessTokenId,
        role,
        ver: tokenVersion,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const jwtTokenData: InsertJWTToken = {
      userId,
      accessToken,
      expiresAt: accessTokenExpiresAt,
      revoked: false,
    };

    const refreshTokenData: InsertRefreshToken = {
      userId,
      token: refreshTokenValue,
      expiresAt: refreshTokenExpiresAt,
      revoked: false,
    };

    const [jwtTokenRecord, refreshTokenRecord] = await Promise.all([
      storage.createJWTToken(jwtTokenData),
      storage.createRefreshToken(refreshTokenData),
    ]);

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      accessTokenId: jwtTokenRecord.id,
      refreshTokenId: refreshTokenRecord.id,
      expiresAt: accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };
  }

  async verifyAccessToken(
    token: string
  ): Promise<{ userId: string; role: string; jti: string; ver?: number } | null> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { 
        sub: string; 
        jti: string; 
        role: string;
        ver?: number;
      };

      const isValid = await storage.verifyJWTToken(decoded.jti);
      if (!isValid) {
        return null;
      }

      if (decoded.ver !== undefined) {
        const currentVersion = await this.getUserTokenVersion(decoded.sub);
        if (decoded.ver < currentVersion) {
          logger.info(`Token rejected: version ${decoded.ver} < current ${currentVersion} for user ${decoded.sub}`);
          return null;
        }
      }

      return {
        userId: decoded.sub,
        role: decoded.role,
        jti: decoded.jti,
        ver: decoded.ver,
      };
    } catch (error: unknown) {
      return null;
    }
  }

  async refreshAccessToken(
    refreshTokenValue: string
  ): Promise<RotatedTokenResult | null> {
    const refreshToken = await storage.getRefreshToken(refreshTokenValue);

    if (!refreshToken || refreshToken.revoked) {
      return null;
    }

    const now = new Date();
    if (refreshToken.expiresAt < now) {
      return null;
    }

    const user = await storage.getUser(refreshToken.userId);
    if (!user) {
      return null;
    }

    await storage.revokeRefreshToken(refreshToken.id, 'Token rotation');

    const tokenVersion = await this.getUserTokenVersion(user.id);
    const accessTokenId = crypto.randomUUID();
    const newRefreshTokenId = crypto.randomUUID();
    const newRefreshTokenValue = crypto.randomBytes(32).toString('hex');
    const accessTokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS);
    const refreshTokenExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    const accessToken = jwt.sign(
      {
        sub: user.id,
        jti: accessTokenId,
        role: user.role || 'user',
        ver: tokenVersion,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const jwtTokenData: InsertJWTToken = {
      userId: user.id,
      accessToken,
      expiresAt: accessTokenExpiresAt,
      revoked: false,
    };

    const newRefreshTokenData: InsertRefreshToken = {
      userId: user.id,
      token: newRefreshTokenValue,
      expiresAt: refreshTokenExpiresAt,
      revoked: false,
    };

    const [jwtTokenRecord, newRefreshTokenRecord] = await Promise.all([
      storage.createJWTToken(jwtTokenData),
      storage.createRefreshToken(newRefreshTokenData),
    ]);

    return {
      accessToken,
      refreshToken: newRefreshTokenValue,
      accessTokenId: jwtTokenRecord.id,
      refreshTokenId: newRefreshTokenRecord.id,
      expiresAt: accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };
  }

  async revokeAllUserTokens(userId: string, reason: string = 'User logout'): Promise<void> {
    await Promise.all([
      storage.revokeAllJWTTokensForUser(userId, reason),
      storage.revokeAllRefreshTokensForUser(userId, reason),
    ]);
  }

  async revokeToken(tokenId: string, reason: string): Promise<void> {
    await storage.revokeJWTToken(tokenId, reason);
  }

  async forceLogoutUser(userId: string, reason: string = 'Forced logout'): Promise<void> {
    await this.incrementUserTokenVersion(userId);
    await this.revokeAllUserTokens(userId, reason);
    logger.info(`Forced logout for user ${userId}: ${reason}`);
  }

  async forceLogoutAllSessions(userId: string, reason: string = 'Security: all sessions revoked'): Promise<void> {
    await this.forceLogoutUser(userId, reason);
    try {
      const { sessionTracking } = await import('./sessionTrackingService.js');
      await sessionTracking.revokeAllUserSessions(userId);
    } catch (error) {
      logger.warn('Session tracking not available for full session revocation');
    }
  }
}

export const jwtAuthService = new JWTAuthService();

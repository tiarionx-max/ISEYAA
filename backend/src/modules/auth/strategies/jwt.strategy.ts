import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; role: string; jti: string }) {
    // F-04: reject access tokens whose jti has been blacklisted (logout / refresh
    // rotation). Access + refresh share one jti, and logout writes `blacklist:{jti}`
    // in Redis. Previously only refreshTokens() consulted the blacklist, so a
    // logged-out (or stolen-then-logged-out) access token stayed valid for its full
    // 15-minute lifetime. This closes that revocation gap on every protected request.
    if (payload.jti) {
      const blacklisted = await this.redis.exists(`blacklist:${payload.jti}`);
      if (blacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }
    return { userId: payload.sub, role: payload.role, jti: payload.jti };
  }
}

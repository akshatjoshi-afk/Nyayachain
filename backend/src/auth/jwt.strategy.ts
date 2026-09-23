import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * JwtStrategy validates the Bearer token on each protected request.
 * Extracts the JWT from the Authorization header, verifies signature
 * using JWT_SECRET, and attaches the decoded payload to req.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'nyayachain-super-secret-jwt-key-2024',
    });
  }

  /**
   * Called after token signature is verified.
   * The returned object becomes req.user in controllers/guards.
   */
  async validate(payload: any) {
    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}

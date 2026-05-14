import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuthService } from '../../../src/modules/auth/auth.service';
import {
  ValidateTokenRequest,
  ValidateTokenResponse,
  GetUserRequest,
  GetUserResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
} from '@iseyaa/proto';

@Controller()
export class AuthGrpcController {
  private readonly logger = new Logger(AuthGrpcController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @GrpcMethod('AuthService', 'ValidateToken')
  async validateToken(data: ValidateTokenRequest): Promise<ValidateTokenResponse> {
    try {
      const payload = this.jwt.verify<{ sub: string; role: string }>(data.token, {
        secret: this.config.get('JWT_SECRET'),
      });
      return { valid: true, userId: payload.sub, role: payload.role };
    } catch {
      return { valid: false, userId: '', role: '' };
    }
  }

  @GrpcMethod('AuthService', 'GetUser')
  async getUser(data: GetUserRequest): Promise<GetUserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, email: true, phone: true, role: true, status: true },
    });
    if (!user) return { id: '', email: '', phone: '', role: '', status: '' };
    return {
      id: user.id,
      email: user.email ?? '',
      phone: user.phone ?? '',
      role: user.role,
      status: user.status,
    };
  }

  @GrpcMethod('AuthService', 'RefreshToken')
  async refreshToken(data: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    try {
      const tokens = await this.authService.refreshTokens(data.refreshToken);
      return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    } catch {
      this.logger.warn('gRPC RefreshToken failed');
      return { accessToken: '', refreshToken: '' };
    }
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { AuthModule } from '../../../src/modules/auth/auth.module';
import { AuthGrpcController } from './auth-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
  ],
  controllers: [AuthGrpcController],
})
export class AppModule {}

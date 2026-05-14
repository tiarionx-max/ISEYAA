import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { AdminModule } from '../../../src/modules/admin/admin.module';
import { AdminGrpcController } from './admin-grpc.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, RedisModule, CommonModule, AdminModule],
  controllers: [AdminGrpcController],
})
export class AppModule {}

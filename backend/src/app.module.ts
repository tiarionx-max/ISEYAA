import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LgasModule } from './modules/lgas/lgas.module';
import { TourismModule } from './modules/tourism/tourism.module';
import { EventsModule } from './modules/events/events.module';
import { StaysModule } from './modules/stays/stays.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { StudioModule } from './modules/studio/studio.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AiModule } from './modules/ai/ai.module';
import { TransportModule } from './modules/transport/transport.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { SearchModule } from './search/search.module';
import { HealthModule } from './health/health.module';
import { KafkaModule } from './kafka/kafka.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ClientsModule.register([
      {
        name: 'AUTH_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'auth',
          protoPath: join(__dirname, '../../../packages/proto/auth.proto'),
          url: process.env.AUTH_SERVICE_URL || 'auth-service.railway.internal:5001',
        },
      },
      {
        name: 'WALLET_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'wallet',
          protoPath: join(__dirname, '../../../packages/proto/wallet.proto'),
          url: process.env.WALLET_SERVICE_URL || 'wallet-service.railway.internal:5002',
        },
      },
      {
        name: 'EVENTS_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'events',
          protoPath: join(__dirname, '../../../packages/proto/events.proto'),
          url: process.env.EVENTS_SERVICE_URL || 'events-service.railway.internal:5003',
        },
      },
      {
        name: 'STAYS_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'stays',
          protoPath: join(__dirname, '../../../packages/proto/stays.proto'),
          url: process.env.STAYS_SERVICE_URL || 'stays-service.railway.internal:5004',
        },
      },
      {
        name: 'MARKETPLACE_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'marketplace',
          protoPath: join(__dirname, '../../../packages/proto/marketplace.proto'),
          url: process.env.MARKETPLACE_SERVICE_URL || 'marketplace-service.railway.internal:5005',
        },
      },
      {
        name: 'ADMIN_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'admin',
          protoPath: join(__dirname, '../../../packages/proto/admin.proto'),
          url: process.env.ADMIN_SERVICE_URL || 'admin-service.railway.internal:5006',
        },
      },
      {
        name: 'AI_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'ai',
          protoPath: join(__dirname, '../../../packages/proto/ai.proto'),
          url: process.env.AI_SERVICE_URL || 'ai-service.railway.internal:5007',
        },
      },
      {
        name: 'NOTIFICATIONS_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'notifications',
          protoPath: join(__dirname, '../../../packages/proto/notifications.proto'),
          url: process.env.NOTIFICATIONS_SERVICE_URL || 'notifications-service.railway.internal:5008',
        },
      },
    ]),
    PrismaModule,
    CommonModule,
    RedisModule,
    AuthModule,
    UsersModule,
    LgasModule,
    TourismModule,
    EventsModule,
    StaysModule,
    TransportModule,
    DeliveryModule,
    MarketplaceModule,
    StudioModule,
    WalletModule,
    AdminModule,
    NotificationsModule,
    AiModule,
    WebhooksModule,
    WaitlistModule,
    SearchModule,
    HealthModule,
    KafkaModule,
  ],
})
export class AppModule {}

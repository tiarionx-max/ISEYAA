import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
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

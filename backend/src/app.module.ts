import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { RedisModule } from './redis/redis.module';
import { ResilienceModule } from './resilience/resilience.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LgasModule } from './modules/lgas/lgas.module';
import { TourismModule } from './modules/tourism/tourism.module';
import { TourGuidesModule } from './modules/tour-guides/tour-guides.module';
import { TourPackagesModule } from './modules/tour-packages/tour-packages.module';
import { TourBookingsModule } from './modules/tour-bookings/tour-bookings.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { EventsModule } from './modules/events/events.module';
import { StaysModule } from './modules/stays/stays.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { StudioModule } from './modules/studio/studio.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { AdminModule } from './modules/admin/admin.module';
import { SettlementDisputesModule } from './modules/settlement-disputes/settlement-disputes.module';
import { MinistryModule } from './modules/ministry/ministry.module';
import { NotificationsClientModule } from './modules/notifications-client/notifications-client.module';
import { AiModule } from './modules/ai/ai.module';
import { TransportModule } from './modules/transport/transport.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WaitlistClientModule } from './modules/waitlist-client/waitlist-client.module';
import { NewsClientModule } from './modules/news-client/news-client.module';
import { SearchModule } from './search/search.module';
import { HealthModule } from './health/health.module';
import { KafkaModule } from './kafka/kafka.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: path.resolve(__dirname, '..', '..', '.env') }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    RedisModule,
    ResilienceModule,
    AuthModule,
    UsersModule,
    LgasModule,
    TourismModule,
    TourGuidesModule,
    TourPackagesModule,
    TourBookingsModule,
    ReviewsModule,
    EventsModule,
    StaysModule,
    TransportModule,
    DeliveryModule,
    MarketplaceModule,
    StudioModule,
    WalletModule,
    AdminModule,
    SettlementDisputesModule,
    MinistryModule,
    NotificationsClientModule,
    AiModule,
    WebhooksModule,
    WaitlistClientModule,
    NewsClientModule,
    SearchModule,
    HealthModule,
    KafkaModule,
  ],
})
export class AppModule {}

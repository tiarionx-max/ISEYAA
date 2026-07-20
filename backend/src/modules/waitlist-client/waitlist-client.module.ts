import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { WaitlistClientService } from './waitlist-client.service';
import { WaitlistController } from '../waitlist/waitlist.controller';
// 21-03: extracted to a zero-import leaf file to break a require cycle with
// waitlist-client.service.ts — do not move this declaration back here.
import { WAITLIST_PACKAGE } from './waitlist-client.constants';

/**
 * 21-03: Registers a gRPC client for the `waitlist` package, targeting waitlist-service.
 * Target URL is env-var-driven via WAITLIST_SERVICE_URL (pre-existing .env.example
 * placeholder, added alongside NEWS_SERVICE_URL in Phase 21 scaffolding).
 *
 * WaitlistController is registered here directly — the monolith's POST /api/v1/waitlist and
 * GET /api/v1/waitlist/stats endpoints are now served by this gRPC facade. The controller's
 * file stays physically located at backend/src/modules/waitlist/waitlist.controller.ts
 * (minimal-diff); only its module registration and injected dependency changed.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: WAITLIST_PACKAGE,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'waitlist',
            // 4 '../' segments from this file's __dirname (backend/src/modules/waitlist-client)
            // reach the repo root — matches news-client.module.ts's / notifications-client.module.ts's
            // confirmed depth.
            protoPath: join(__dirname, '../../../../packages/proto/waitlist.proto'),
            url: config.get<string>('WAITLIST_SERVICE_URL', 'localhost:5010'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [WaitlistController],
  providers: [WaitlistClientService],
  exports: [WaitlistClientService],
})
export class WaitlistClientModule {}

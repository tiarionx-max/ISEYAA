import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { NewsClientService } from './news-client.service';
import { NewsController } from '../news/news.controller';
// 21-02: extracted to a zero-import leaf file to break a require cycle with
// news-client.service.ts — do not move this declaration back here.
import { NEWS_PACKAGE } from './news-client.constants';

/**
 * 21-02: Registers a gRPC client for the `news` package, targeting news-service. Target URL
 * is env-var-driven via NEWS_SERVICE_URL (pre-existing .env.example placeholder).
 *
 * NewsController is registered here directly — the monolith's GET /api/v1/news endpoint is
 * now served by this gRPC facade. The controller's file stays physically located at
 * backend/src/modules/news/news.controller.ts (minimal-diff); only its module registration
 * and injected dependency changed.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: NEWS_PACKAGE,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'news',
            // 4 '../' segments from this file's __dirname (backend/src/modules/news-client)
            // reach the repo root — matches notifications-client.module.ts's confirmed depth.
            protoPath: join(__dirname, '../../../../packages/proto/news.proto'),
            url: config.get<string>('NEWS_SERVICE_URL', 'localhost:5009'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [NewsController],
  providers: [NewsClientService],
  exports: [NewsClientService],
})
export class NewsClientModule {}

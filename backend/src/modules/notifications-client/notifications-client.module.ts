import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { NotificationsClientService } from './notifications-client.service';

// D-02: dedicated gRPC client token for the notifications-service facade — mirrors
// CommonModule's shared-infra export pattern. Consumers inject NotificationsClientService,
// never this token directly.
export const NOTIFICATIONS_PACKAGE = 'NOTIFICATIONS_PACKAGE';

/**
 * 17-03 (D-02, D-04): First ClientGrpc registration in this codebase. Registers a gRPC
 * client for the `notifications` package, targeting notifications-service. The gRPC
 * target URL is env-var-driven via NOTIFICATIONS_SERVICE_URL — reusing the pre-existing
 * .env.example placeholder (added Phase 10, unused until now) rather than introducing a
 * new NOTIFICATIONS_GRPC_URL name (RESEARCH.md Open Question 1, resolved in CONTEXT.md
 * D-04 addendum). NOT yet consumed by any controller/service — that cutover happens in
 * Plan 17-04.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: NOTIFICATIONS_PACKAGE,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'notifications',
            // 4 '../' segments from this file's __dirname (backend/src/modules/notifications-client)
            // reach the repo root — matches the depth confirmed correct in both src and compiled
            // dist output (dist mirrors src at the same nesting depth under backend/).
            protoPath: join(__dirname, '../../../../packages/proto/notifications.proto'),
            url: config.get<string>('NOTIFICATIONS_SERVICE_URL', 'localhost:5008'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [NotificationsClientService],
  exports: [NotificationsClientService],
})
export class NotificationsClientModule {}

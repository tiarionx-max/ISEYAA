import { Module } from '@nestjs/common';
import { DbMetricsService } from './services/db-metrics.service';

// Purpose-built module for consumers (e.g. notifications-service) that only
// need DB connection-pool observability, without pulling in the rest of
// CommonModule's 17 providers (Flutterwave, S3, Dojah, Vector, Settlement, etc.)
// and its 2 HTTP controllers, which are unrelated to a gRPC-only microservice.
@Module({
  providers: [DbMetricsService],
  exports: [DbMetricsService],
})
export class DbMetricsModule {}

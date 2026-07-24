import { Module } from '@nestjs/common';
import { NewsModule } from './news.module';
import { NewsAdminController } from './news-admin.controller';

/**
 * Admin CRUD/moderation, isolated into its own module — mirrors
 * ReviewsAdminModule's precedent exactly.
 *
 * NewsModule (controllers: []) is wholesale-imported by apps/news-service's
 * AppModule for its own in-process NewsGrpcController -> NewsService wiring.
 * Isolating NewsAdminController here (rather than adding it to NewsModule's
 * controllers array) prevents these LGA_ADMIN+-gated HTTP routes — which
 * depend on JwtAuthGuard/RolesGuard infrastructure the extracted gRPC process
 * never wires up — from being unintentionally instantiated inside that
 * process too.
 */
@Module({
  imports: [NewsModule],
  controllers: [NewsAdminController],
})
export class NewsAdminModule {}

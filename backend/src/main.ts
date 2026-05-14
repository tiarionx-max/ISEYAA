import * as Sentry from '@sentry/nestjs';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.APP_ENV ?? 'development',
  tracesSampleRate: 0.1,
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(), { rawBody: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: config.get<string>('ALLOWED_ORIGINS', '*').split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  app.setGlobalPrefix('api/v1');

  if (config.get('APP_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ISEYAA API')
      .setDescription('Ogun State Digital Super-Platform — REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  console.log(`ISEYAA backend running on http://localhost:${port}/api/v1`);
  if (config.get('APP_ENV') !== 'production') {
    console.log(`Swagger docs at http://localhost:${port}/api/docs`);
  }
}

bootstrap();

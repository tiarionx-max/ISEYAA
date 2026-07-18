import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'notifications',
      protoPath: join(__dirname, '../../../../../packages/proto/notifications.proto'),
      url: '0.0.0.0:5008',
    },
  });
  await app.listen();
  console.log('notifications-service gRPC listening on :5008');
}

bootstrap();

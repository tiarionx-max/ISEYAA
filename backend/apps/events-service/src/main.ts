import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'events',
      protoPath: join(__dirname, '../../../../packages/proto/events.proto'),
      url: '0.0.0.0:5003',
    },
  });
  await app.listen();
  console.log('events-service gRPC listening on :5003');
}

bootstrap();

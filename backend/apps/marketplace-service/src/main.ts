import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'marketplace',
      protoPath: join(__dirname, '../../../../../packages/proto/marketplace.proto'),
      url: '0.0.0.0:5005',
    },
  });
  await app.listen();
  console.log('marketplace-service gRPC listening on :5005');
}

bootstrap();

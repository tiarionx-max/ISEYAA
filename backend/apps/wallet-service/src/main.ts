import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'wallet',
      protoPath: join(__dirname, '../../../../packages/proto/wallet.proto'),
      url: '0.0.0.0:5002',
    },
  });
  await app.listen();
  console.log('wallet-service gRPC listening on :5002');
}

bootstrap();

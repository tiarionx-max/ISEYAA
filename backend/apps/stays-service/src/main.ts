import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'stays',
      protoPath: join(__dirname, '../../../../../packages/proto/stays.proto'),
      // Railway's private network (<name>.railway.internal) is IPv6-only —
      // an IPv4-only 0.0.0.0 bind makes this service unreachable for inter-service gRPC calls once deployed.
      url: '[::]:5004',
    },
  });
  await app.listen();
  console.log('stays-service gRPC listening on :5004');
}

bootstrap();

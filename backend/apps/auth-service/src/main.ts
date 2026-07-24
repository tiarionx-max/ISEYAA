import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'auth',
      protoPath: join(__dirname, '../../../../../packages/proto/auth.proto'),
      url: '0.0.0.0:5001',
    },
  });
  await app.listen();
  console.log('auth-service gRPC listening on :5001');
}

bootstrap();

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'admin',
      protoPath: join(__dirname, '../../../../../packages/proto/admin.proto'),
      url: '0.0.0.0:5006',
    },
  });
  await app.listen();
  console.log('admin-service gRPC listening on :5006');
}

bootstrap();

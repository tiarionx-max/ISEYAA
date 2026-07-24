import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'ai',
      protoPath: join(__dirname, '../../../../../packages/proto/ai.proto'),
      url: '0.0.0.0:5007',
    },
  });
  await app.listen();
  console.log('ai-service gRPC listening on :5007');
}

bootstrap();

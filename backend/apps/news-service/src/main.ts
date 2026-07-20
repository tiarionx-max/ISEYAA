import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { HealthImplementation, protoPath as healthCheckProtoPath } from 'grpc-health-check';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: ['news', 'grpc.health.v1'],
      protoPath: [
        join(__dirname, '../../../../../packages/proto/news.proto'),
        healthCheckProtoPath,
      ],
      url: '0.0.0.0:5009',
      onLoadPackageDefinition: (pkg, server) => {
        const healthImpl = new HealthImplementation({ '': 'UNKNOWN' });
        healthImpl.addToServer(server);
        healthImpl.setStatus('', 'SERVING');
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 8080);
  console.log('news-service gRPC :5009, HTTP healthz :8080');
}

bootstrap();

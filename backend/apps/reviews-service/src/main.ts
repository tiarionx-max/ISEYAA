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
      package: ['reviews', 'grpc.health.v1'],
      protoPath: [
        join(__dirname, '../../../../../packages/proto/reviews.proto'),
        healthCheckProtoPath,
      ],
      url: '0.0.0.0:5011',
      onLoadPackageDefinition: (pkg, server) => {
        const healthImpl = new HealthImplementation({ '': 'UNKNOWN' });
        healthImpl.addToServer(server);
        healthImpl.setStatus('', 'SERVING');
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 8080);
  console.log('reviews-service gRPC :5011, HTTP healthz :8080');
}

bootstrap();

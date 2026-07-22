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
      package: 'waitlist',
      protoPath: [
        join(__dirname, '../../../../../packages/proto/waitlist.proto'),
        healthCheckProtoPath,
      ],
      url: '0.0.0.0:5010',
      onLoadPackageDefinition: (() => {
        let registered = false;
        return (pkg, server) => {
          if (registered) return;
          registered = true;
          const healthImpl = new HealthImplementation({ '': 'UNKNOWN' });
          healthImpl.addToServer(server);
          healthImpl.setStatus('', 'SERVING');
        };
      })(),
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 8080);
  console.log('waitlist-service gRPC :5010, HTTP healthz :8080');
}

bootstrap();

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HealthImplementation, protoPath as healthCheckProtoPath } from 'grpc-health-check';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'auth',
      protoPath: [
        join(__dirname, '../../../../../packages/proto/auth.proto'),
        healthCheckProtoPath,
      ],
      // Railway's private network (<name>.railway.internal) is IPv6-only —
      // an IPv4-only 0.0.0.0 bind makes this service unreachable for inter-service gRPC calls once deployed.
      url: '[::]:5001',
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

  const config = new DocumentBuilder()
    .setTitle('auth-service')
    .setDescription(
      'gRPC-internal microservice — HTTP surface is health-only (/healthz). Real API contract is the gRPC "auth" package in packages/proto/auth.proto.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 8080);
  console.log('auth-service gRPC :5001, HTTP healthz :8080');
}

bootstrap();

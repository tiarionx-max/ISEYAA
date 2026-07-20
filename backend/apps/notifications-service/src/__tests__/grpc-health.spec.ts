import * as grpc from '@grpc/grpc-js';
import { HealthImplementation, service as healthServiceDef } from 'grpc-health-check';

describe('grpc.health.v1.Health wiring (Wave 0 harness)', () => {
  let server: grpc.Server;
  let port: number;
  type HealthClientType = grpc.Client & {
    check: (
      request: { service: string },
      callback: (error: grpc.ServiceError | null, response: { status: string }) => void,
    ) => void;
  };
  let client: HealthClientType;

  beforeAll(async () => {
    server = new grpc.Server();
    const healthImpl = new HealthImplementation({ '': 'UNKNOWN' });
    healthImpl.addToServer(server);
    healthImpl.setStatus('', 'SERVING');

    port = await new Promise<number>((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
        if (err) {
          reject(err);
          return;
        }
        server.start();
        resolve(boundPort);
      });
    });

    const HealthClient = grpc.makeGenericClientConstructor(healthServiceDef, 'Health');
    client = new HealthClient(
      `127.0.0.1:${port}`,
      grpc.credentials.createInsecure(),
    ) as unknown as HealthClientType;
  });

  afterAll((done) => {
    server.tryShutdown(() => done());
  });

  it('resolves SERVING for two concurrent Health.Check RPCs against the empty service key', async () => {
    const callOnce = () =>
      new Promise<{ status: string }>((resolve, reject) => {
        client.check({ service: '' }, (err, response) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
      });

    const [first, second] = await Promise.all([callOnce(), callOnce()]);

    expect(first.status).toBe('SERVING');
    expect(second.status).toBe('SERVING');
  });
});

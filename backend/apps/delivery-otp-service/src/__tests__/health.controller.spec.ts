import { Test, TestingModule } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from '../health.controller';

describe('HealthController (Wave 0 harness)', () => {
  let moduleRef: TestingModule;
  let controller: HealthController;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('resolves an object with status "ok" when there are zero registered indicators', async () => {
    const result = await controller.check();

    expect(result).toMatchObject({ status: 'ok' });
  });
});

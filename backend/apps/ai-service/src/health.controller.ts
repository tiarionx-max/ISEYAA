import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

@Controller()
export class HealthController {
  constructor(private health: HealthCheckService) {}

  @Get('healthz')
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}

import { Controller, Get, Inject } from '@nestjs/common';
import { HealthService } from './health.service.js';
@Controller('health')
export class HealthController { constructor(@Inject(HealthService) private readonly healthService: HealthService) {} @Get() getStatus() { return this.healthService.getStatus(); } @Get('live') live() { return this.healthService.getStatus(); } @Get('ready') ready() { return this.healthService.ready(); } }

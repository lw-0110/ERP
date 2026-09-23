import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { prisma } from '../auth/prisma.js';
@Injectable()
export class HealthService {
  getStatus() { return { status: 'ok' as const, version: process.env.APP_VERSION ?? '1.0.0' }; }
  async ready() {
    try { await prisma.$queryRaw`SELECT 1`; return { status: 'ready' as const, version: process.env.APP_VERSION ?? '1.0.0' }; }
    catch { throw new ServiceUnavailableException('Service is not ready.'); }
  }
}

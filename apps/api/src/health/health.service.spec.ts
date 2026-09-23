import { describe, expect, it } from 'vitest';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('reports a healthy API', () => {
    expect(new HealthService().getStatus()).toEqual({ status: 'ok', version: '1.0.0' });
  });
});

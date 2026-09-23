import { describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { envSchema } from '../config/env.schema.js';
import { requestSecurity } from './http-security.js';

describe('production environment validation', () => {
  it('requires explicit HTTPS auth/origin and rate-limit policy', () => {
    expect(envSchema.safeParse({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://a:b@localhost/db' }).success).toBe(false);
    expect(envSchema.safeParse({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://a:b@localhost/db', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'https://api.example.test', WEB_URL: 'https://app.example.test', DEFAULT_ORGANIZATION_SLUG: 'production', RATE_LIMIT_WINDOW_MS: 60000, RATE_LIMIT_AUTH_MAX: 10, RATE_LIMIT_MUTATION_MAX: 20, RATE_LIMIT_INVITATION_MAX: 10, STAFF_INVITATION_TTL_HOURS: 48 }).success).toBe(true);
  });
  it('applies the configured auth limit without inspecting credentials', () => {
    const middleware = requestSecurity(envSchema.parse({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://a:b@localhost/db', RATE_LIMIT_WINDOW_MS: 60000, RATE_LIMIT_AUTH_MAX: 1, RATE_LIMIT_MUTATION_MAX: 2 }));
    const request = { method: 'POST', path: '/api/auth/sign-in/email', headers: {}, socket: { remoteAddress: 'test-client' } } as unknown as Request;
    let status = 0; let payload: unknown; const response = { setHeader() { return undefined; }, on() { return undefined; }, status(value: number) { status = value; return this; }, json(value: unknown) { payload = value; return this; } } as unknown as Response;
    let nextCalls = 0; const next = (() => { nextCalls += 1; }) as NextFunction;
    middleware(request, response, next); middleware(request, response, next);
    expect(nextCalls).toBe(1); expect(status).toBe(429); expect(payload).toMatchObject({ code: 'RATE_LIMITED' });
  });
});

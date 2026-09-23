import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Environment } from '../config/env.schema.js';
import type { TenantRequest } from '../business/tenant-request.js';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth/auth.js';
import { prisma } from '../auth/prisma.js';

type IdentifiedRequest = TenantRequest & { requestId?: string };
type Bucket = { count: number; resetAt: number };

export function requestSecurity(env: Environment) {
  const buckets = new Map<string, Bucket>();
  const windowMs = env.RATE_LIMIT_WINDOW_MS ?? 60_000;
  const authMax = env.RATE_LIMIT_AUTH_MAX ?? 60;
  const mutationMax = env.RATE_LIMIT_MUTATION_MAX ?? 120;
  const invitationMax = env.RATE_LIMIT_INVITATION_MAX ?? 30;
  const allowedOrigins = new Set([env.WEB_URL ?? 'http://localhost:5173', env.BETTER_AUTH_URL ?? 'http://localhost:3000']);
  return (req: Request, res: Response, next: NextFunction): void => {
    const request = req as IdentifiedRequest;
    request.requestId = randomUUID();
    res.setHeader('X-Request-ID', request.requestId);
    const started = Date.now();
    if (env.NODE_ENV !== 'test') res.on('finish', () => {
      console.info(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', requestId: request.requestId, method: req.method, path: req.path, statusCode: res.statusCode, durationMs: Date.now() - started, userId: request.identity?.session.user.id, organizationId: request.identity?.membership.organizationId }));
    });
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (unsafe && req.headers.cookie) {
      const origin = req.headers.origin;
      if ((origin && !allowedOrigins.has(origin)) || (env.NODE_ENV === 'production' && !origin)) {
        res.status(403).json({ code: 'INVALID_ORIGIN', message: 'Request origin is not allowed.', requestId: request.requestId });
        return;
      }
    }
    const authRoute = unsafe && /^\/api\/auth\/(sign-in|sign-up|forget-password|reset-password)/.test(req.path);
    const mutationRoute = unsafe && (/^\/bookings$/.test(req.path) || /^\/customers\/me$/.test(req.path) || /^\/notifications\//.test(req.path));
    const invitationRoute = unsafe && /^\/staff-invitations\/(validate|redeem)$/.test(req.path);
    if (authRoute || mutationRoute || invitationRoute) {
      const category = authRoute ? 'auth' : invitationRoute ? 'invitation' : 'mutation';
      const max = authRoute ? authMax : invitationRoute ? invitationMax : mutationMax;
      const key = `${category}:${req.socket.remoteAddress ?? 'unknown'}`;
      const now = Date.now();
      const previous = buckets.get(key);
      const bucket = previous && previous.resetAt > now ? previous : { count: 0, resetAt: now + windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);
      if (buckets.size > 10_000) for (const [entry, value] of buckets) if (value.resetAt <= now) buckets.delete(entry);
      if (bucket.count > max) {
        res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
        res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many requests. Try again later.', requestId: request.requestId });
        return;
      }
    }
    next();
  };
}

export function authAudit() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const request = req as IdentifiedRequest;
    const route = req.path;
    const isSignIn = route === '/sign-in/email'; const isSignUp = route === '/sign-up/email'; const isSignOut = route === '/sign-out';
    if (!isSignIn && !isSignUp && !isSignOut) { next(); return; }
    let actorUserId: string | undefined; let organizationId: string | undefined;
    if (isSignOut) {
      try {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
        actorUserId = session?.user.id;
        organizationId = actorUserId ? (await prisma.membership.findFirst({ where: { userId: actorUserId, status: 'ACTIVE' }, select: { organizationId: true } }))?.organizationId : undefined;
      } catch { /* Authentication must still own its response if audit context is unavailable. */ }
    }
    res.on('finish', () => {
      const successful = res.statusCode >= 200 && res.statusCode < 400;
      const action = isSignIn ? `auth.sign_in.${successful ? 'succeeded' : 'failed'}` : isSignUp ? `auth.sign_up.${successful ? 'succeeded' : 'failed'}` : `auth.sign_out.${successful ? 'succeeded' : 'failed'}`;
      void prisma.auditLog.create({ data: { organizationId, actorUserId, action, entityType: 'Authentication', entityId: actorUserId, metadata: { requestId: request.requestId ?? '' } } }).catch(() => console.error(JSON.stringify({ level: 'error', event: 'auth.audit.failed', requestId: request.requestId })));
    });
    next();
  };
}

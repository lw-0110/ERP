import { z } from 'zod';
const positive = z.coerce.number().int().positive().optional();
export const envSchema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  WEB_URL: z.string().url().optional(),
  DEFAULT_ORGANIZATION_SLUG: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: positive,
  RATE_LIMIT_AUTH_MAX: positive,
  RATE_LIMIT_MUTATION_MAX: positive,
  RATE_LIMIT_INVITATION_MAX: positive,
  STAFF_INVITATION_TTL_HOURS: positive,
  APP_VERSION: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/).default('1.0.0'),
  SWAGGER_ENABLED: z.enum(['true', 'false']).default('false'),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  for (const key of ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'WEB_URL', 'DEFAULT_ORGANIZATION_SLUG', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_AUTH_MAX', 'RATE_LIMIT_MUTATION_MAX', 'RATE_LIMIT_INVITATION_MAX', 'STAFF_INVITATION_TTL_HOURS'] as const) {
    if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production.` });
  }
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length < 32) ctx.addIssue({ code: 'custom', path: ['BETTER_AUTH_SECRET'], message: 'Auth secret is too short.' });
  for (const key of ['BETTER_AUTH_URL', 'WEB_URL'] as const) if (env[key] && !env[key].startsWith('https://')) ctx.addIssue({ code: 'custom', path: [key], message: `${key} must use HTTPS in production.` });
});
export type Environment = z.infer<typeof envSchema>;

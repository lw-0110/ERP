import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { auth } from './auth/auth.js';
import { envSchema } from './config/env.schema.js';
import { authAudit, requestSecurity } from './security/http-security.js';
import { SafeExceptionFilter } from './security/safe-exception.filter.js';

export async function createApp() {
  const env = envSchema.parse(process.env);
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(requestSecurity(env));
  app.use(helmet({ strictTransportSecurity: env.NODE_ENV === 'production' }));
  app.enableCors({ origin: env.WEB_URL ?? 'http://localhost:5173', credentials: true });
  app.use('/api/auth', authAudit(), toNodeHandler(auth));
  app.use(express.json());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new SafeExceptionFilter());
  if (env.NODE_ENV !== 'production' || env.SWAGGER_ENABLED === 'true') {
    const swagger = new DocumentBuilder()
      .setTitle('Booking Management Platform API')
      .setDescription('Tenant-scoped V1 REST API. Better Auth is mounted under /api/auth.')
      .setVersion(env.APP_VERSION)
      .addCookieAuth('better-auth.session_token')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
  }
  app.enableShutdownHooks();
  return app;
}

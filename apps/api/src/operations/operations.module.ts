import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityInterceptor } from './activity.interceptor.js';
import { ActivityService } from './activity.service.js';
import { AuditController } from './audit.controller.js';
import { NotificationController } from './notification.controller.js';
import { SessionGuard } from './session.guard.js';

@Module({
  controllers: [NotificationController, AuditController],
  providers: [
    ActivityService,
    SessionGuard,
    { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor },
  ],
})
export class OperationsModule {}

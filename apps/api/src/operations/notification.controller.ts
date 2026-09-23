import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { prisma } from '../auth/prisma.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';
import { SessionGuard } from './session.guard.js';

class PageQuery {
  @IsOptional() @IsInt() @Min(1) @Max(10000) page = 1;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20;
}
const pagePipe = new ValidationPipe({
  expectedType: PageQuery,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('notifications')
@UseGuards(SessionGuard)
export class NotificationController {
  @Get() async list(@Req() req: TenantRequest, @Query(pagePipe) query: PageQuery) {
    const { organizationId, userId } = tenantContext(req);
    const where = { organizationId, userId };
    const [items, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.notification.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }
  @Get('unread-count') async unread(@Req() req: TenantRequest) {
    const { organizationId, userId } = tenantContext(req);
    return {
      count: await prisma.notification.count({ where: { organizationId, userId, readAt: null } }),
    };
  }
  @Patch('read-all') async readAll(@Req() req: TenantRequest) {
    const { organizationId, userId } = tenantContext(req);
    const result = await prisma.notification.updateMany({
      where: { organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }
  @Patch(':id/read') async read(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    const { organizationId, userId } = tenantContext(req);
    await prisma.notification.updateMany({
      where: { id, organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    const notification = await prisma.notification.findFirst({
      where: { id, organizationId, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found.');
    return notification;
  }
}

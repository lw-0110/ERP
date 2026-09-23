import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { prisma } from '../auth/prisma.js';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';

class AuditQuery {
  @IsOptional() @IsInt() @Min(1) @Max(10000) page = 1;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() actorUserId?: string;
  @IsOptional() @IsString() @MaxLength(120) action?: string;
  @IsOptional() @IsString() @MaxLength(80) entityType?: string;
}
const queryPipe = new ValidationPipe({
  expectedType: AuditQuery,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('audit-logs')
@UseGuards(PermissionGuard)
export class AuditController {
  @Get() @RequirePermission('audit.read') async list(
    @Req() req: TenantRequest,
    @Query(queryPipe) query: AuditQuery,
  ) {
    const organizationId = tenantContext(req).organizationId;
    if (query.from && query.to && query.from > query.to)
      throw new BadRequestException('Audit date range is invalid.');
    const where = {
      organizationId,
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(new Date(query.to).getTime() + 86_400_000) } : {}),
      },
    };
    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }
  @Get(':id') @RequirePermission('audit.read') async detail(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const record = await prisma.auditLog.findFirst({
      where: { id, organizationId: tenantContext(req).organizationId },
    });
    if (!record) throw new NotFoundException('Audit record not found.');
    return record;
  }
}

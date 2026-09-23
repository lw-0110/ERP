import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';
import { AttendanceService } from './attendance.service.js';

class ClockInDto { @IsOptional() @IsString() @MaxLength(1000) note?: string; }
class AttendanceQueryDto { @IsOptional() @IsUUID() staffId?: string; }
const bodyPipe = new ValidationPipe({ expectedType: ClockInDto, transform: true, whitelist: true, forbidNonWhitelisted: true });
const queryPipe = new ValidationPipe({ expectedType: AttendanceQueryDto, transform: true, whitelist: true, forbidNonWhitelisted: true });

@Controller('attendance') @UseGuards(PermissionGuard)
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendance: AttendanceService) {}
  @Post('clock-in') @RequirePermission('attendance.clock.own') clockIn(@Req() req: TenantRequest, @Body(bodyPipe) dto: ClockInDto) { const context = tenantContext(req); return this.attendance.clockIn(context.organizationId, context.userId, dto.note); }
  @Post('clock-out') @RequirePermission('attendance.clock.own') clockOut(@Req() req: TenantRequest) { const context = tenantContext(req); return this.attendance.clockOut(context.organizationId, context.userId); }
  @Get('my') @RequirePermission('attendance.read.own') mine(@Req() req: TenantRequest) { const context = tenantContext(req); return this.attendance.mine(context.organizationId, context.userId); }
  @Get() @RequirePermission('attendance.read.all') list(@Req() req: TenantRequest, @Query(queryPipe) query: AttendanceQueryDto) { return this.attendance.list(tenantContext(req).organizationId, query.staffId); }
  @Get(':id') @RequirePermission('attendance.read.all') get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) { return this.attendance.get(tenantContext(req).organizationId, id); }
}

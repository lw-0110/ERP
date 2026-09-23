import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequireAnyPermission, RequirePermission } from '../authorization/permission.decorator.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';
import { LeaveService } from './leave.service.js';

class LeaveTypeDto { @IsString() @MinLength(1) @MaxLength(100) name!: string; @IsOptional() @IsString() @MaxLength(1000) description?: string; }
class LeaveDto { @IsUUID() leaveTypeId!: string; @IsDateString() startDateTime!: string; @IsDateString() endDateTime!: string; @IsOptional() @IsString() @MaxLength(2000) reason?: string; }
class ReviewDto { @IsOptional() @IsString() @MaxLength(2000) adminNote?: string; }
const pipe = <T extends object>(expectedType: new () => T) => new ValidationPipe({ expectedType, transform: true, whitelist: true, forbidNonWhitelisted: true });

@Controller() @UseGuards(PermissionGuard)
export class LeaveController {
  constructor(@Inject(LeaveService) private readonly leaves: LeaveService) {}
  @Get('leave-types') @RequireAnyPermission('leave.create.own', 'leave.type.manage') types(@Req() req: TenantRequest) { return this.leaves.types(tenantContext(req).organizationId); }
  @Post('leave-types') @RequirePermission('leave.type.manage') createType(@Req() req: TenantRequest, @Body(pipe(LeaveTypeDto)) dto: LeaveTypeDto) { return this.leaves.createType(tenantContext(req).organizationId, dto.name, dto.description); }
  @Patch('leave-types/:id/archive') @RequirePermission('leave.type.manage') archiveType(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) { return this.leaves.archiveType(tenantContext(req).organizationId, id); }
  @Post('leave-requests') @RequirePermission('leave.create.own') create(@Req() req: TenantRequest, @Body(pipe(LeaveDto)) dto: LeaveDto) { const context = tenantContext(req); return this.leaves.create(context.organizationId, context.userId, dto.leaveTypeId, new Date(dto.startDateTime), new Date(dto.endDateTime), dto.reason); }
  @Get('leave-requests/my') @RequirePermission('leave.read.own') mine(@Req() req: TenantRequest) { const context = tenantContext(req); return this.leaves.mine(context.organizationId, context.userId); }
  @Get('leave-requests/my/:id') @RequirePermission('leave.read.own') own(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) { const context = tenantContext(req); return this.leaves.own(context.organizationId, context.userId, id); }
  @Get('leave-requests') @RequirePermission('leave.read.all') list(@Req() req: TenantRequest) { return this.leaves.list(tenantContext(req).organizationId); }
  @Get('leave-requests/:id') @RequireAnyPermission('leave.read.own', 'leave.read.all') get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) { const context = tenantContext(req); return req.identity?.permissions?.includes('leave.read.all') ? this.leaves.get(context.organizationId, id) : this.leaves.own(context.organizationId, context.userId, id); }
  @Patch('leave-requests/:id/approve') @RequirePermission('leave.review') approve(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body(pipe(ReviewDto)) dto: ReviewDto) { const context = tenantContext(req); return this.leaves.review(context.organizationId, id, context.userId, 'APPROVED', dto.adminNote); }
  @Patch('leave-requests/:id/reject') @RequirePermission('leave.review') reject(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body(pipe(ReviewDto)) dto: ReviewDto) { const context = tenantContext(req); return this.leaves.review(context.organizationId, id, context.userId, 'REJECTED', dto.adminNote); }
}

import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsInt, IsISO4217CurrencyCode, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';
import { CommissionService } from './commission.service.js';

class RuleDto { @IsOptional() @IsUUID() serviceId?: string; @IsObject() configuration!: Record<string, unknown>; }
class UpdateRuleDto { @IsObject() configuration!: Record<string, unknown>; }
class EarnedCommissionDto {
  @IsUUID() bookingId!: string;
  @IsUUID() bookingServiceId!: string;
  @IsUUID() staffId!: string;
  @IsInt() @Min(1) amountMinor!: number;
  @IsISO4217CurrencyCode() currency!: string;
  @IsString() @MinLength(1) @MaxLength(2000) explanation!: string;
}
const pipe = <T extends object>(expectedType: new () => T) => new ValidationPipe({ expectedType, transform: true, whitelist: true, forbidNonWhitelisted: true });

@Controller() @UseGuards(PermissionGuard)
export class CommissionController {
  constructor(@Inject(CommissionService) private readonly commissions: CommissionService) {}
  @Get('commission-rules') @RequirePermission('commission.rule.manage') rules(@Req() req: TenantRequest) { return this.commissions.rules(tenantContext(req).organizationId); }
  @Post('commission-rules') @RequirePermission('commission.rule.manage') createRule(@Req() req: TenantRequest, @Body(pipe(RuleDto)) dto: RuleDto) { return this.commissions.createRule(tenantContext(req).organizationId, dto.serviceId, dto.configuration); }
  @Patch('commission-rules/:id') @RequirePermission('commission.rule.manage') updateRule(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body(pipe(UpdateRuleDto)) dto: UpdateRuleDto) { return this.commissions.updateRule(tenantContext(req).organizationId, id, dto.configuration); }
  @Patch('commission-rules/:id/archive') @RequirePermission('commission.rule.manage') archiveRule(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) { return this.commissions.archiveRule(tenantContext(req).organizationId, id); }
  @Get('commissions/my') @RequirePermission('commission.read.own') mine(@Req() req: TenantRequest) { const context = tenantContext(req); return this.commissions.mine(context.organizationId, context.userId); }
  @Get('commissions') @RequirePermission('commission.read.all') list(@Req() req: TenantRequest) { return this.commissions.list(tenantContext(req).organizationId); }
  @Post('commissions') @RequirePermission('commission.record') record(@Req() req: TenantRequest, @Body(pipe(EarnedCommissionDto)) dto: EarnedCommissionDto) { const context = tenantContext(req); return this.commissions.record(context.organizationId, context.userId, dto); }
}

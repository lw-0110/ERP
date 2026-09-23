import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsISO4217CurrencyCode, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';
import { PaymentService } from './payment.service.js';

class PaymentDto {
  @IsInt() @Min(1) amountMinor!: number;
  @IsISO4217CurrencyCode() currency!: string;
  @IsString() @MinLength(1) @MaxLength(100) paymentMethod!: string;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsDateString() paidAt!: string;
}
class PaymentStatusDto { @IsEnum(PaymentStatus) status!: PaymentStatus; }
const pipe = <T extends object>(expectedType: new () => T) => new ValidationPipe({ expectedType, transform: true, whitelist: true, forbidNonWhitelisted: true });

@Controller() @UseGuards(PermissionGuard)
export class PaymentController {
  constructor(@Inject(PaymentService) private readonly payments: PaymentService) {}
  @Get('bookings/:id/payments') @RequirePermission('payment.read.all') list(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) { return this.payments.list(tenantContext(req).organizationId, id); }
  @Post('bookings/:id/payments') @RequirePermission('payment.record') record(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body(pipe(PaymentDto)) dto: PaymentDto) { const context = tenantContext(req); return this.payments.record(context.organizationId, id, context.userId, { ...dto, paidAt: new Date(dto.paidAt) }); }
  @Get('bookings/:id/payment-summary') @RequirePermission('payment.read.all') summary(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) { return this.payments.summary(tenantContext(req).organizationId, id); }
  @Get('bookings/my/:id/payment-summary') @RequirePermission('payment.read.own') ownSummary(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) { const context = tenantContext(req); return this.payments.summary(context.organizationId, id, context.userId); }
  @Patch('bookings/:id/payment-status') @RequirePermission('payment.status.manage') status(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body(pipe(PaymentStatusDto)) dto: PaymentStatusDto) { return this.payments.setStatus(tenantContext(req).organizationId, id, dto.status); }
}

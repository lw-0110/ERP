import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsISO4217CurrencyCode, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import type { Response } from 'express';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';
import { csv } from './csv.js';
import { ReportService, type ReportFilter } from './report.service.js';
import { csvColumn, csvFilename, resolveLanguage } from '../i18n/localize.js';

class ReportQueryDto implements ReportFilter {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() staffId?: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() leaveTypeId?: string;
  @IsOptional() @IsISO4217CurrencyCode() currency?: string;
}
const queryPipe = new ValidationPipe({
  expectedType: ReportQueryDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
type ExportName = 'bookings' | 'payments' | 'commissions' | 'attendance' | 'leave';
const exportHeaders: Record<ExportName, string[]> = {
  bookings: [
    'bookingId',
    'bookingNumber',
    'startDateTime',
    'endDateTime',
    'status',
    'paymentStatus',
    'durationMinutes',
  ],
  payments: ['paymentId', 'bookingId', 'amountMinor', 'currency', 'paymentMethod', 'paidAt'],
  commissions: [
    'commissionId',
    'bookingId',
    'bookingServiceId',
    'serviceId',
    'staffId',
    'amountMinor',
    'currency',
    'recordedAt',
  ],
  attendance: [
    'attendanceId',
    'staffId',
    'workDate',
    'clockInAt',
    'clockOutAt',
    'status',
    'recordedDurationMs',
  ],
  leave: ['leaveRequestId', 'staffId', 'leaveTypeId', 'startDateTime', 'endDateTime', 'status'],
};

@Controller()
@UseGuards(PermissionGuard)
export class ReportController {
  constructor(@Inject(ReportService) private readonly reports: ReportService) {}
  @Get('reports/dashboard') @RequirePermission('report.read.operations') dashboard(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
  ) {
    return this.reports.dashboard(
      tenantContext(req).organizationId,
      filter,
      Boolean(req.identity?.permissions?.includes('report.read.finance')),
    );
  }
  @Get('reports/bookings') @RequirePermission('report.read.operations') bookings(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
  ) {
    return this.reports.bookings(tenantContext(req).organizationId, filter);
  }
  @Get('reports/payments') @RequirePermission('report.read.finance') payments(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
  ) {
    return this.reports.payments(tenantContext(req).organizationId, filter);
  }
  @Get('reports/commissions/my') @RequirePermission('commission.read.own') ownCommissions(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
  ) {
    const context = tenantContext(req);
    return this.reports.ownCommissions(context.organizationId, context.userId, filter);
  }
  @Get('reports/commissions') @RequirePermission('report.read.finance') commissions(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
  ) {
    return this.reports.commissions(tenantContext(req).organizationId, filter);
  }
  @Get('reports/attendance') @RequirePermission('report.read.operations') attendance(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
  ) {
    return this.reports.attendance(tenantContext(req).organizationId, filter);
  }
  @Get('reports/leave') @RequirePermission('report.read.operations') leave(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
  ) {
    return this.reports.leave(tenantContext(req).organizationId, filter);
  }
  @Get('reports/staff/:id') @RequirePermission('report.read.operations') staff(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(queryPipe) filter: ReportQueryDto,
  ) {
    return this.reports.staff(
      tenantContext(req).organizationId,
      id,
      filter,
      Boolean(req.identity?.permissions?.includes('report.read.finance')),
    );
  }

  private async export(
    name: ExportName,
    req: TenantRequest,
    filter: ReportQueryDto,
    response: Response,
  ) {
    const finance = name === 'payments' || name === 'commissions';
    if (
      !req.identity?.permissions?.includes(
        finance ? 'report.read.finance' : 'report.read.operations',
      )
    )
      throw new ForbiddenException();
    const organizationId = tenantContext(req).organizationId;
    const result =
      name === 'bookings'
        ? await this.reports.bookings(organizationId, filter)
        : name === 'payments'
          ? await this.reports.payments(organizationId, filter)
          : name === 'commissions'
            ? await this.reports.commissions(organizationId, filter)
            : name === 'attendance'
              ? await this.reports.attendance(organizationId, filter)
              : await this.reports.leave(organizationId, filter);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const language = resolveLanguage(req.headers['accept-language']);
    response.setHeader('Content-Disposition', `attachment; filename="${name}.csv"; filename*=UTF-8''${encodeURIComponent(csvFilename(name, language))}`);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Vary', 'Accept-Language');
    return csv(exportHeaders[name].map((key) => csvColumn(key, language)), result.rows);
  }
  @Get('exports/bookings.csv') @RequirePermission('report.export') exportBookings(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.export('bookings', req, filter, res);
  }
  @Get('exports/payments.csv') @RequirePermission('report.export') exportPayments(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.export('payments', req, filter, res);
  }
  @Get('exports/commissions.csv') @RequirePermission('report.export') exportCommissions(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.export('commissions', req, filter, res);
  }
  @Get('exports/attendance.csv') @RequirePermission('report.export') exportAttendance(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.export('attendance', req, filter, res);
  }
  @Get('exports/leave.csv') @RequirePermission('report.export') exportLeave(
    @Req() req: TenantRequest,
    @Query(queryPipe) filter: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.export('leave', req, filter, res);
  }
}

import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Put,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsInt, IsString, Max, Min } from 'class-validator';
import { prisma } from '../auth/prisma.js';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';
import { SchedulingService } from './scheduling.service.js';
class OpeningHourDto {
  @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @IsString() openTime!: string;
  @IsString() closeTime!: string;
}
class StaffScheduleDto {
  @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
}
const openingPipe = new ValidationPipe({
  expectedType: OpeningHourDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const staffPipe = new ValidationPipe({
  expectedType: StaffScheduleDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
@Controller()
@UseGuards(PermissionGuard)
export class SchedulingController {
  constructor(@Inject(SchedulingService) private readonly schedules: SchedulingService) {}
  @Get('opening-hours') @RequirePermission('organization.read') hours(@Req() req: TenantRequest) {
    return prisma.organizationOpeningHour.findMany({
      where: { organizationId: tenantContext(req).organizationId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }
  @Put('opening-hours') @RequirePermission('organization.settings.manage') setHours(
    @Req() req: TenantRequest,
    @Body(openingPipe) dto: OpeningHourDto,
  ) {
    return this.schedules.openingHour(
      tenantContext(req).organizationId,
      dto.dayOfWeek,
      dto.openTime,
      dto.closeTime,
    );
  }
  @Patch('opening-hours/:dayOfWeek/disable')
  @RequirePermission('organization.settings.manage')
  disableHours(@Req() req: TenantRequest, @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number) {
    return this.schedules.disableOpeningHour(tenantContext(req).organizationId, dayOfWeek);
  }
  @Get('staff/:staffId/schedule') @RequirePermission('staff.read.all') staffHours(
    @Req() req: TenantRequest,
    @Param('staffId') staffId: string,
  ) {
    return prisma.staffWorkingSchedule.findMany({
      where: { organizationId: tenantContext(req).organizationId, staffId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }
  @Put('staff/:staffId/schedule') @RequirePermission('staff.schedule.manage') setStaffHours(
    @Req() req: TenantRequest,
    @Param('staffId') staffId: string,
    @Body(staffPipe) dto: StaffScheduleDto,
  ) {
    return this.schedules.staffSchedule(
      tenantContext(req).organizationId,
      staffId,
      dto.dayOfWeek,
      dto.startTime,
      dto.endTime,
    );
  }
  @Patch('staff/:staffId/schedule/:dayOfWeek/disable')
  @RequirePermission('staff.schedule.manage')
  disableStaffHours(
    @Req() req: TenantRequest,
    @Param('staffId') staffId: string,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
  ) {
    return this.schedules.disableStaffSchedule(
      tenantContext(req).organizationId,
      staffId,
      dayOfWeek,
    );
  }
}

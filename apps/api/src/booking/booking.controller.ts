import {
  Body,
  Controller,
  Get,
  ForbiddenException,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';
import { AssignmentService } from './assignment.service.js';
import { BookingService } from './booking.service.js';
import { BookingLifecycleService } from './booking-lifecycle.service.js';

class BookingLineDto {
  @IsUUID() serviceId!: string;
  @IsInt() @Min(1) quantity!: number;
}
class CreateBookingDto {
  @IsDateString() startDateTime!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingLineDto)
  services!: BookingLineDto[];
}
class CreateForCustomerDto extends CreateBookingDto { @IsUUID() customerId!: string; }
class AssignmentDto {
  @IsArray() @IsUUID('4', { each: true }) ids!: string[];
}
class BookingStatusDto {
  @IsIn(['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW']) status!:
    'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW';
}
class CancelBookingDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
class RescheduleBookingDto {
  @IsDateString() newStartDateTime!: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
const bodyPipe = <T extends object>(expectedType: new () => T) =>
  new ValidationPipe({
    expectedType,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

@Controller()
@UseGuards(PermissionGuard)
export class BookingController {
  constructor(
    @Inject(BookingService) private readonly bookings: BookingService,
    @Inject(BookingLifecycleService) private readonly lifecycle: BookingLifecycleService,
    @Inject(AssignmentService) private readonly assignments: AssignmentService,
  ) {}
  @Post('availability/check') @RequirePermission('booking.create.own') check(
    @Req() req: TenantRequest,
    @Body(bodyPipe(CreateBookingDto)) dto: CreateBookingDto,
  ) {
    return this.bookings.checkAvailability(
      tenantContext(req).organizationId,
      new Date(dto.startDateTime),
      dto.services,
    );
  }
  @Post('availability/check-for-customer') @RequirePermission('booking.create.all') checkForCustomer(
    @Req() req: TenantRequest,
    @Body(bodyPipe(CreateBookingDto)) dto: CreateBookingDto,
  ) {
    return this.bookings.checkAvailability(tenantContext(req).organizationId, new Date(dto.startDateTime), dto.services);
  }
  @Post('bookings/for-customer') @RequirePermission('booking.create.all') createForCustomer(
    @Req() req: TenantRequest,
    @Body(bodyPipe(CreateForCustomerDto)) dto: CreateForCustomerDto,
  ) {
    const context = tenantContext(req);
    if (!req.identity?.permissions?.includes('customer.read.all')) throw new ForbiddenException();
    return this.bookings.createForCustomer(context.organizationId, context.userId, new Date(dto.startDateTime), dto.services, dto.customerId);
  }
  @Post('bookings') @RequirePermission('booking.create.own') create(
    @Req() req: TenantRequest,
    @Body(bodyPipe(CreateBookingDto)) dto: CreateBookingDto,
  ) {
    const context = tenantContext(req);
    return this.bookings.createForCustomer(
      context.organizationId,
      context.userId,
      new Date(dto.startDateTime),
      dto.services,
    );
  }
  @Get('bookings/my') @RequirePermission('booking.read.own') mine(@Req() req: TenantRequest) {
    const context = tenantContext(req);
    return this.bookings.listOwn(context.organizationId, context.userId);
  }
  @Get('bookings/my/:id') @RequirePermission('booking.read.own') mineOne(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const context = tenantContext(req);
    return this.bookings.getOwn(context.organizationId, context.userId, id);
  }
  @Get('bookings/assigned') @RequirePermission('booking.read.assigned') assigned(
    @Req() req: TenantRequest,
  ) {
    const context = tenantContext(req);
    return this.bookings.listAssigned(context.organizationId, context.userId);
  }
  @Get('bookings/assigned/:id') @RequirePermission('booking.read.assigned') assignedOne(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const context = tenantContext(req);
    return this.bookings.getAssigned(context.organizationId, context.userId, id);
  }
  @Get('bookings/my/:id/eligibility') @RequirePermission('booking.read.own') eligibility(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const context = tenantContext(req);
    return this.lifecycle.customerEligibility(context.organizationId, context.userId, id);
  }
  @Patch('bookings/:id/cancel') @RequirePermission('booking.cancel.own') cancelOwn(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(bodyPipe(CancelBookingDto)) dto: CancelBookingDto,
  ) {
    const context = tenantContext(req);
    return this.lifecycle.cancelCustomer(context.organizationId, context.userId, id, dto.reason);
  }
  @Patch('bookings/:id/reschedule') @RequirePermission('booking.reschedule.own') rescheduleOwn(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(bodyPipe(RescheduleBookingDto)) dto: RescheduleBookingDto,
  ) {
    const context = tenantContext(req);
    return this.lifecycle.rescheduleCustomer(
      context.organizationId,
      context.userId,
      id,
      new Date(dto.newStartDateTime),
      dto.reason,
    );
  }
  @Get('bookings') @RequirePermission('booking.read.all') list(@Req() req: TenantRequest) {
    return this.bookings.listAll(tenantContext(req).organizationId);
  }
  @Get('bookings/:id') @RequirePermission('booking.read.all') get(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookings.get(tenantContext(req).organizationId, id);
  }
  @Patch('bookings/:id/status') @RequirePermission('booking.status.update') status(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(bodyPipe(BookingStatusDto)) dto: BookingStatusDto,
  ) {
    const context = tenantContext(req);
    return this.bookings.setStatus(context.organizationId, id, dto.status, context.userId);
  }
  @Patch('admin/bookings/:id/cancel') @RequirePermission('booking.cancel.all') cancelAdmin(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(bodyPipe(CancelBookingDto)) dto: CancelBookingDto,
  ) {
    const context = tenantContext(req);
    return this.lifecycle.cancelAdmin(context.organizationId, context.userId, id, dto.reason);
  }
  @Patch('admin/bookings/:id/reschedule')
  @RequirePermission('booking.reschedule.all')
  rescheduleAdmin(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(bodyPipe(RescheduleBookingDto)) dto: RescheduleBookingDto,
  ) {
    const context = tenantContext(req);
    return this.lifecycle.rescheduleAdmin(
      context.organizationId,
      context.userId,
      id,
      new Date(dto.newStartDateTime),
      dto.reason,
    );
  }
  private async verifyLine(organizationId: string, bookingId: string, lineId: string) {
    const booking = await this.bookings.get(organizationId, bookingId);
    if (!booking.services.some((line) => line.id === lineId))
      throw new NotFoundException('Booking service not found.');
  }
  @Get('bookings/:id/services/:lineId/eligible-staff')
  @RequirePermission('booking.assign_staff')
  async eligibleStaff(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    const context = tenantContext(req);
    await this.verifyLine(context.organizationId, id, lineId);
    return this.assignments.eligibleStaff(context.organizationId, lineId);
  }
  @Get('bookings/:id/services/:lineId/eligible-resources')
  @RequirePermission('booking.assign_resource')
  async eligibleResources(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    const context = tenantContext(req);
    await this.verifyLine(context.organizationId, id, lineId);
    return this.assignments.eligibleResources(context.organizationId, lineId);
  }
  @Put('bookings/:id/services/:lineId/staff')
  @RequirePermission('booking.assign_staff')
  async staff(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body(bodyPipe(AssignmentDto)) dto: AssignmentDto,
  ) {
    const context = tenantContext(req);
    await this.verifyLine(context.organizationId, id, lineId);
    return this.assignments.replaceStaff(context.organizationId, lineId, dto.ids, context.userId);
  }
  @Put('bookings/:id/services/:lineId/resources')
  @RequirePermission('booking.assign_resource')
  async resources(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body(bodyPipe(AssignmentDto)) dto: AssignmentDto,
  ) {
    const context = tenantContext(req);
    await this.verifyLine(context.organizationId, id, lineId);
    return this.assignments.replaceResources(
      context.organizationId,
      lineId,
      dto.ids,
      context.userId,
    );
  }
}

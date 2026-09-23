import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { CustomerDto, PaginationDto, StatusDto } from './dto.js';
import { CustomerService } from './customer.service.js';
import { tenantContext, type TenantRequest } from './tenant-request.js';
import { IsString, Length } from 'class-validator';
class CompleteCustomerDto { @IsString() @Length(1, 120) firstName!: string; @IsString() @Length(1, 120) lastName!: string; @IsString() @Length(1, 50) phone!: string; }

@Controller('customers') @UseGuards(PermissionGuard)
export class CustomerController {
  constructor(@Inject(CustomerService) private readonly customers: CustomerService) {}
  @Post() @RequirePermission('customer.create') create(@Req() req: TenantRequest, @Body() dto: CustomerDto) { return this.customers.create(tenantContext(req).organizationId, dto); }
  @Get() @RequirePermission('customer.read.all') list(@Req() req: TenantRequest, @Query() query: PaginationDto) { return this.customers.list(tenantContext(req).organizationId, query); }
  @Get('booking-search') @RequirePermission('customer.read.all') searchForBooking(@Req() req: TenantRequest, @Query('q') query = '') { return this.customers.searchForBooking(tenantContext(req).organizationId, query); }
  @Get('me') @RequirePermission('customer.read.own') own(@Req() req: TenantRequest) { const context = tenantContext(req); return this.customers.getOwn(context.organizationId, context.userId); }
  @Post('me') @RequirePermission('customer.update.own') complete(@Req() req: TenantRequest, @Body(new ValidationPipe({ expectedType: CompleteCustomerDto, transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: CompleteCustomerDto) { const context = tenantContext(req); return this.customers.completeOwn(context.organizationId, context.userId, dto.firstName, dto.lastName, dto.phone); }
  @Get(':id') @RequirePermission('customer.read.all') get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) { return this.customers.get(tenantContext(req).organizationId, id); }
  @Patch(':id') @RequirePermission('customer.update.all') update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomerDto) { return this.customers.update(tenantContext(req).organizationId, id, dto); }
  @Patch(':id/status') @RequirePermission('customer.update.all') status(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) { return this.customers.setStatus(tenantContext(req).organizationId, id, dto.status); }
}

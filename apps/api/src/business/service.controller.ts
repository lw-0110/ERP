import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { CategoryDto, PaginationDto, ResourceTypeDto, ServiceDto, StatusDto } from './dto.js';
import { ServiceService } from './service.service.js';
import { tenantContext, type TenantRequest } from './tenant-request.js';

@Controller() @UseGuards(PermissionGuard)
export class ServiceController {
  constructor(@Inject(ServiceService) private readonly services: ServiceService) {}
  @Post('service-categories') @RequirePermission('service.category.manage') createCategory(@Req() req: TenantRequest, @Body() dto: CategoryDto) { return this.services.createCategory(tenantContext(req).organizationId, dto); }
  @Get('service-categories') @RequirePermission('service.read') categories(@Req() req: TenantRequest) { return this.services.listCategories(tenantContext(req).organizationId); }
  @Patch('service-categories/:id') @RequirePermission('service.category.manage') updateCategory(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryDto) { return this.services.updateCategory(tenantContext(req).organizationId, id, dto); }
  @Patch('service-categories/:id/status') @RequirePermission('service.category.manage') categoryStatus(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) { return this.services.setCategoryStatus(tenantContext(req).organizationId, id, dto.status); }
  @Post('resource-types') @RequirePermission('resource.type.manage') createResourceType(@Req() req: TenantRequest, @Body() dto: ResourceTypeDto) { return this.services.createResourceType(tenantContext(req).organizationId, dto); }
  @Get('resource-types') @RequirePermission('resource.read') resourceTypes(@Req() req: TenantRequest) { return this.services.listResourceTypes(tenantContext(req).organizationId); }
  @Patch('resource-types/:id') @RequirePermission('resource.type.manage') updateResourceType(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResourceTypeDto) { return this.services.updateResourceType(tenantContext(req).organizationId, id, dto); }
  @Patch('resource-types/:id/status') @RequirePermission('resource.type.manage') resourceTypeStatus(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) { return this.services.setResourceTypeStatus(tenantContext(req).organizationId, id, dto.status); }
  @Post('services') @RequirePermission('service.create') create(@Req() req: TenantRequest, @Body() dto: ServiceDto) { return this.services.create(tenantContext(req).organizationId, dto); }
  @Get('services') @RequirePermission('service.read') list(@Req() req: TenantRequest, @Query() query: PaginationDto) { return this.services.list(tenantContext(req).organizationId, query); }
  @Get('services/:id') @RequirePermission('service.read') get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) { return this.services.get(tenantContext(req).organizationId, id); }
  @Patch('services/:id') @RequirePermission('service.update') update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ServiceDto) { return this.services.update(tenantContext(req).organizationId, id, dto); }
  @Patch('services/:id/status') @RequirePermission('service.disable') status(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) { return this.services.setStatus(tenantContext(req).organizationId, id, dto.status); }
}

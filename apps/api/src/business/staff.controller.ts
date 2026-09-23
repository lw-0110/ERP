import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { PaginationDto, SkillDto, SkillIdsDto, StaffDto, StatusDto } from './dto.js';
import { StaffService } from './staff.service.js';
import { tenantContext, type TenantRequest } from './tenant-request.js';

@Controller() @UseGuards(PermissionGuard)
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}
  @Post('staff') @RequirePermission('staff.create') create(@Req() req: TenantRequest, @Body() dto: StaffDto) { return this.staff.create(tenantContext(req).organizationId, dto); }
  @Get('staff') @RequirePermission('staff.read.all') list(@Req() req: TenantRequest, @Query() query: PaginationDto) { return this.staff.list(tenantContext(req).organizationId, query); }
  @Get('staff/me') @RequirePermission('staff.read.own') own(@Req() req: TenantRequest) { const context = tenantContext(req); return this.staff.getOwn(context.organizationId, context.userId); }
  @Get('staff/:id') @RequirePermission('staff.read.all') get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) { return this.staff.get(tenantContext(req).organizationId, id); }
  @Patch('staff/:id') @RequirePermission('staff.update.all') update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StaffDto) { return this.staff.update(tenantContext(req).organizationId, id, dto); }
  @Patch('staff/:id/status') @RequirePermission('staff.update.all') status(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) { return this.staff.setStatus(tenantContext(req).organizationId, id, dto.status); }
  @Put('staff/:id/skills') @RequirePermission('staff.update.all') skills(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SkillIdsDto) { return this.staff.replaceSkills(tenantContext(req).organizationId, id, dto.skillIds); }
  @Post('skills') @RequirePermission('staff.update.all') createSkill(@Req() req: TenantRequest, @Body() dto: SkillDto) { return this.staff.createSkill(tenantContext(req).organizationId, dto); }
  @Get('skills') @RequirePermission('staff.read.all') listSkills(@Req() req: TenantRequest) { return this.staff.listSkills(tenantContext(req).organizationId); }
  @Patch('skills/:id') @RequirePermission('staff.update.all') updateSkill(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SkillDto) { return this.staff.updateSkill(tenantContext(req).organizationId, id, dto); }
}

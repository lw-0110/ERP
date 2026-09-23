import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ArrayUnique, IsArray, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';
import { forbidden } from '../security/application-error.js';
import { PermissionGuard } from './permission.guard.js';
import { RequirePermission } from './permission.decorator.js';
import { RoleAssignmentService } from './role-assignment.service.js';
import { RoleManagementService } from './role-management.service.js';

class RoleInputDto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() @ArrayUnique() @IsString({ each: true }) permissionKeys!: string[];
}
class AssignRoleDto { @IsUUID() roleId!: string; }

@Controller() @UseGuards(PermissionGuard)
export class RoleManagementController {
  constructor(@Inject(RoleManagementService) private readonly roles: RoleManagementService, @Inject(RoleAssignmentService) private readonly assignments: RoleAssignmentService) {}

  @Get('permissions') @RequirePermission('role.read') permissions() { return this.roles.permissions(); }
  @Get('roles') @RequirePermission('role.read') list(@Req() req: TenantRequest) { return this.roles.roles(tenantContext(req).organizationId); }
  @Post('roles') @RequirePermission('role.create') create(@Req() req: TenantRequest, @Body() dto: RoleInputDto) {
    if (dto.permissionKeys.length && !req.identity?.permissions?.includes('role.permission.manage')) throw forbidden('AUTH_ACCESS_DENIED');
    const context = tenantContext(req);
    return this.roles.create(context.organizationId, context.userId, dto);
  }
  @Patch('roles/:id') @RequirePermission('role.update') update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoleInputDto) {
    const context = tenantContext(req);
    return this.roles.update(context.organizationId, context.userId, id, dto, Boolean(req.identity?.permissions?.includes('role.permission.manage')));
  }
  @Patch('roles/:id/archive') @RequirePermission('role.archive') archive(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    const context = tenantContext(req);
    return this.roles.archive(context.organizationId, context.userId, id);
  }
  @Get('memberships') @RequirePermission('role.read') memberships(@Req() req: TenantRequest) { return this.roles.memberships(tenantContext(req).organizationId); }
  @Patch('memberships/:id/role') @RequirePermission('role.update') assign(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRoleDto) {
    const context = tenantContext(req);
    return this.assignments.assign({ membershipId: id, roleId: dto.roleId, organizationId: context.organizationId, actorUserId: context.userId });
  }
}

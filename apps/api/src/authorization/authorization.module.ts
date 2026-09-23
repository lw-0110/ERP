import { Module } from '@nestjs/common';
import { PermissionGuard } from './permission.guard.js';
import { RoleAssignmentService } from './role-assignment.service.js';
import { AuthorizationProbeController } from './authorization-probe.controller.js';
import { RoleManagementController } from './role-management.controller.js';
import { RoleManagementService } from './role-management.service.js';
@Module({ controllers: [AuthorizationProbeController, RoleManagementController], providers: [PermissionGuard, RoleAssignmentService, RoleManagementService], exports: [PermissionGuard, RoleAssignmentService] })
export class AuthorizationModule {}

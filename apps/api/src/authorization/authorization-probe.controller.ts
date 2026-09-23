import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermission } from './permission.decorator.js';
import { PermissionGuard } from './permission.guard.js';
@Controller('_authorization-probe')
export class AuthorizationProbeController { @Get() @UseGuards(PermissionGuard) @RequirePermission('role.read') check() { return { allowed: true }; } }

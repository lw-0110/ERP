import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsEmail, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';
import type { Request } from 'express';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { PermissionGuard } from '../authorization/permission.guard.js';
import type { TenantRequest } from './tenant-request.js';
import { tenantContext } from './tenant-request.js';
import { StaffInvitationService } from './staff-invitation.service.js';
import { StaffDto } from './dto.js';
import { badRequest } from '../security/application-error.js';

class TokenDto {
  @IsString() @Length(40, 100) token!: string;
}
class CreateInvitationDto { @IsOptional() @IsUUID() roleId?: string; }
class CreateStaffAndInviteDto extends StaffDto { @IsOptional() @IsUUID() roleId?: string; @IsOptional() @IsEmail() declare email: string; }
class RedeemDto extends TokenDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
}
const validation = (type: new () => object) =>
  new ValidationPipe({ expectedType: type, transform: true, whitelist: true, forbidNonWhitelisted: true });

@Controller()
@UseGuards(PermissionGuard)
export class StaffInvitationController {
  constructor(@Inject(StaffInvitationService) private readonly invitations: StaffInvitationService) {}

  @Post('staff/create-and-invite')
  @RequirePermission('staff.create')
  createStaffAndInvite(@Req() req: TenantRequest, @Body(validation(CreateStaffAndInviteDto)) dto: CreateStaffAndInviteDto) {
    const context = tenantContext(req);
    if (!req.identity?.permissions?.includes('staff.invite') || !req.identity.permissions.includes('role.update')) throw new ForbiddenException();
    const { roleId, userId, ...staff } = dto;
    if (userId) throw badRequest('VALIDATION_INVALID_REQUEST');
    return this.invitations.createStaffAndInvite(context.organizationId, staff, roleId ?? '', context.userId);
  }

  @Post('staff/:staffId/invitations')
  @RequirePermission('staff.invite')
  create(@Req() req: TenantRequest, @Param('staffId', ParseUUIDPipe) staffId: string, @Body(validation(CreateInvitationDto)) dto: CreateInvitationDto) {
    const context = tenantContext(req);
    if (!req.identity?.permissions?.includes('role.update')) throw new ForbiddenException();
    return this.invitations.create(context.organizationId, staffId, dto.roleId ?? '', context.userId);
  }

  @Get('staff/:staffId/invitations')
  @RequirePermission('staff.invite')
  list(@Req() req: TenantRequest, @Param('staffId', ParseUUIDPipe) staffId: string) {
    return this.invitations.list(tenantContext(req).organizationId, staffId);
  }

  @Patch('staff/:staffId/invitations/:id/revoke')
  @RequirePermission('staff.invite')
  revoke(
    @Req() req: TenantRequest,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invitations.revoke(tenantContext(req).organizationId, staffId, id);
  }

  @Post('staff-invitations/validate')
  validate(@Body(validation(TokenDto)) dto: TokenDto) {
    return this.invitations.validate(dto.token);
  }

  @Post('staff-invitations/redeem')
  redeem(@Req() req: Request, @Body(validation(RedeemDto)) dto: RedeemDto) {
    return this.invitations.redeem(dto.token, dto.name, dto.password, req.headers);
  }
}

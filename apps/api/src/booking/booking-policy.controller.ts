import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';
import { BookingPolicyService } from './booking-policy.service.js';

class BookingPolicyDto {
  @IsBoolean() customerCancellationEnabled!: boolean;
  @IsBoolean() customerRescheduleEnabled!: boolean;
  @IsOptional() @IsInt() @Min(0) cancellationCutoffMinutes!: number | null;
  @IsOptional() @IsInt() @Min(0) rescheduleCutoffMinutes!: number | null;
  @IsOptional() @IsInt() @Min(0) maxCustomerReschedules!: number | null;
}
const policyPipe = new ValidationPipe({
  expectedType: BookingPolicyDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('settings/booking-policy')
@UseGuards(PermissionGuard)
export class BookingPolicyController {
  constructor(@Inject(BookingPolicyService) private readonly policies: BookingPolicyService) {}
  @Get() @RequirePermission('organization.read') get(@Req() req: TenantRequest) {
    return this.policies.get(tenantContext(req).organizationId);
  }
  @Patch() @RequirePermission('organization.settings.manage') update(
    @Req() req: TenantRequest,
    @Body(policyPipe) dto: BookingPolicyDto,
  ) {
    return this.policies.update(tenantContext(req).organizationId, dto);
  }
}

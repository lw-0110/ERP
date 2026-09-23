import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsISO4217CurrencyCode, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { prisma } from '../auth/prisma.js';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';
import { validCurrency } from '../finance/payment.service.js';
import { badRequest } from '../security/application-error.js';

class SettingsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) timezone?: string;
  @IsOptional() @IsISO4217CurrencyCode() defaultCurrency?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(16) bookingNumberPrefix?: string;
}
const bodyPipe = new ValidationPipe({
  expectedType: SettingsDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('settings/organization')
@UseGuards(PermissionGuard)
export class SettingsController {
  @Get() @RequirePermission('organization.read') get(@Req() req: TenantRequest) {
    return prisma.organization.findUniqueOrThrow({
      where: { id: tenantContext(req).organizationId },
      select: {
        id: true,
        name: true,
        timezone: true,
        defaultCurrency: true,
        bookingNumberPrefix: true,
      },
    });
  }
  @Patch() @RequirePermission('organization.settings.manage') update(
    @Req() req: TenantRequest,
    @Body(bodyPipe) dto: SettingsDto,
  ) {
    const bookingNumberPrefix = dto.bookingNumberPrefix?.trim().toUpperCase();
    if (
      !Object.keys(dto).length ||
      (dto.name !== undefined && !dto.name.trim()) ||
      (dto.defaultCurrency && !validCurrency(dto.defaultCurrency)) ||
      (bookingNumberPrefix !== undefined &&
        !/^[A-Z0-9](?:[A-Z0-9-]{0,15})$/.test(bookingNumberPrefix))
    )
      throw badRequest('SETTINGS_INVALID_POLICY');
    if (dto.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: dto.timezone });
      } catch {
        throw badRequest('SETTINGS_INVALID_TIMEZONE');
      }
    }
    return prisma.organization.update({
      where: { id: tenantContext(req).organizationId },
      data: {
        name: dto.name?.trim(),
        timezone: dto.timezone,
        defaultCurrency: dto.defaultCurrency,
        bookingNumberPrefix,
      },
      select: {
        id: true,
        name: true,
        timezone: true,
        defaultCurrency: true,
        bookingNumberPrefix: true,
      },
    });
  }
}

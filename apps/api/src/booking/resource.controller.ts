import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { prisma } from '../auth/prisma.js';
import { PermissionGuard } from '../authorization/permission.guard.js';
import { RequirePermission } from '../authorization/permission.decorator.js';
import { tenantContext, type TenantRequest } from '../business/tenant-request.js';

class ResourceDto {
  @IsUUID() resourceTypeId!: string;
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsString() code?: string;
  @IsInt() @Min(1) capacity!: number;
}
const resourcePipe = new ValidationPipe({
  expectedType: ResourceDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
@Controller('resources')
@UseGuards(PermissionGuard)
export class ResourceController {
  private async resource(organizationId: string, id: string) {
    const resource = await prisma.resource.findFirst({
      where: { id, organizationId },
      include: { resourceType: true },
    });
    if (!resource) throw new NotFoundException('Resource not found.');
    return resource;
  }
  private async type(organizationId: string, id: string) {
    if (!(await prisma.resourceType.findFirst({ where: { id, organizationId, status: 'ACTIVE' } })))
      throw new BadRequestException('Resource type is not active in this organization.');
  }
  @Post() @RequirePermission('resource.create') async create(
    @Req() req: TenantRequest,
    @Body(resourcePipe) dto: ResourceDto,
  ) {
    const { organizationId } = tenantContext(req);
    await this.type(organizationId, dto.resourceTypeId);
    try {
      return await prisma.resource.create({ data: { ...dto, organizationId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Resource name or code already exists.');
      throw error;
    }
  }
  @Get() @RequirePermission('resource.read') list(@Req() req: TenantRequest) {
    return prisma.resource.findMany({
      where: { organizationId: tenantContext(req).organizationId },
      include: { resourceType: true },
      orderBy: { name: 'asc' },
      take: 100,
    });
  }
  @Get(':id') @RequirePermission('resource.read') get(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.resource(tenantContext(req).organizationId, id);
  }
  @Patch(':id') @RequirePermission('resource.update') async update(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(resourcePipe) dto: ResourceDto,
  ) {
    const { organizationId } = tenantContext(req);
    await this.resource(organizationId, id);
    await this.type(organizationId, dto.resourceTypeId);
    return prisma.resource.update({ where: { id }, data: dto });
  }
  @Patch(':id/status') @RequirePermission('resource.disable') async status(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.resource(tenantContext(req).organizationId, id);
    return prisma.resource.update({ where: { id }, data: { status: 'INACTIVE' } });
  }
}

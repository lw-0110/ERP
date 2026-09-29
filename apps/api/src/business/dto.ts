import { Type } from 'class-transformer';
import {
  ArrayNotContains,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  Max,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize = 20;
  @IsOptional() @IsString() search?: string;
}

export class CustomerDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsString() @Length(1, 120) firstName!: string;
  @IsString() @Length(1, 120) lastName!: string;
  @IsString() @Length(1, 240) displayName!: string;
  @IsEmail() email!: string;
  @IsString() @Length(1, 50) phone!: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() notes?: string;
}
export class CustomerUpdateDto extends CustomerDto {}

export class StaffDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsString() @Length(1, 80) employeeCode!: string;
  @IsString() @Length(1, 240) displayName!: string;
  @IsEmail() email!: string;
  @IsString() @Length(1, 50) phone!: string;
  @IsOptional() @IsDateString() hireDate?: string;
}
export class StaffUpdateDto extends StaffDto {}
export class SkillDto { @IsString() @Length(1, 120) name!: string; @IsOptional() @IsString() description?: string; }
export class SkillIdsDto { @IsArray() @ArrayNotContains(['']) @IsUUID('4', { each: true }) skillIds!: string[]; }
export class CategoryDto { @IsString() @Length(1, 120) name!: string; @IsOptional() @IsString() description?: string; }
export class ResourceTypeDto { @IsString() @Length(1, 120) name!: string; @IsOptional() @IsString() description?: string; }
export class RequirementDto { @IsUUID() id!: string; @IsInt() @Min(1) requiredCount!: number; }
export class ServiceDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @Min(1) durationMinutes!: number;
  @IsInt() @Min(0) priceMinor!: number;
  @ValidateIf((_object, value) => value !== undefined) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) commissionPercentage?: number;
  @IsISO4217CurrencyCode() currency!: string;
  @IsInt() @Min(1) requiredStaffCount!: number;
  @IsInt() @Min(0) bufferBeforeMinutes!: number;
  @IsInt() @Min(0) bufferAfterMinutes!: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RequirementDto) requiredSkills?: RequirementDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RequirementDto) requiredResourceTypes?: RequirementDto[];
}
export class StatusDto { @IsIn(['ACTIVE', 'INACTIVE']) status!: 'ACTIVE' | 'INACTIVE'; }

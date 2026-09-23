import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { BusinessModule } from './business/business.module.js';
import { BookingModule } from './booking/booking.module.js';
import { StaffOperationsModule } from './staff-operations/staff-operations.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { ReportingModule } from './reporting/reporting.module.js';
import { OperationsModule } from './operations/operations.module.js';
@Module({ imports: [ConfigModule, HealthModule, IdentityModule, AuthorizationModule, BusinessModule, BookingModule, StaffOperationsModule, FinanceModule, ReportingModule, OperationsModule] })
export class AppModule {}

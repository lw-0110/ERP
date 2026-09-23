import { Module } from '@nestjs/common';
import { StaffOperationsModule } from '../staff-operations/staff-operations.module.js';
import { ReportController } from './report.controller.js';
import { ReportService } from './report.service.js';
import { SettingsController } from './settings.controller.js';

@Module({
  imports: [StaffOperationsModule],
  controllers: [ReportController, SettingsController],
  providers: [ReportService],
})
export class ReportingModule {}

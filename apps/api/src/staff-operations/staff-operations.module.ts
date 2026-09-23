import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { LeaveController } from './leave.controller.js';
import { LeaveService } from './leave.service.js';
import { StaffIdentityService } from './staff-identity.service.js';

@Module({ controllers: [AttendanceController, LeaveController], providers: [StaffIdentityService, AttendanceService, LeaveService], exports: [StaffIdentityService] })
export class StaffOperationsModule {}

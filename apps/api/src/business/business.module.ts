import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';
import { ServiceController } from './service.controller.js';
import { ServiceService } from './service.service.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { StaffInvitationController } from './staff-invitation.controller.js';
import { StaffInvitationService } from './staff-invitation.service.js';
@Module({ controllers: [CustomerController, StaffController, ServiceController, StaffInvitationController], providers: [CustomerService, StaffService, ServiceService, StaffInvitationService] })
export class BusinessModule {}

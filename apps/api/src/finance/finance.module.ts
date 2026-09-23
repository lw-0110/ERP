import { Module } from '@nestjs/common';
import { StaffOperationsModule } from '../staff-operations/staff-operations.module.js';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { CommissionController } from './commission.controller.js';
import { CommissionService } from './commission.service.js';

@Module({ imports: [StaffOperationsModule], controllers: [PaymentController, CommissionController], providers: [PaymentService, CommissionService] })
export class FinanceModule {}

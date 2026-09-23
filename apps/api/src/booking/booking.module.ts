import { Module } from '@nestjs/common';
import { BookingService } from './booking.service.js';
import { SchedulingService } from './scheduling.service.js';
import { AvailabilityService } from './availability.service.js';
import { BookingController } from './booking.controller.js';
import { AssignmentService } from './assignment.service.js';
import { ResourceController } from './resource.controller.js';
import { SchedulingController } from './scheduling.controller.js';
import { BookingPolicyController } from './booking-policy.controller.js';
import { BookingPolicyService } from './booking-policy.service.js';
import { BookingLifecycleService } from './booking-lifecycle.service.js';
@Module({
  controllers: [
    BookingController,
    BookingPolicyController,
    ResourceController,
    SchedulingController,
  ],
  providers: [
    BookingService,
    BookingLifecycleService,
    BookingPolicyService,
    SchedulingService,
    AvailabilityService,
    AssignmentService,
  ],
  exports: [
    BookingService,
    BookingPolicyService,
    SchedulingService,
    AvailabilityService,
    AssignmentService,
  ],
})
export class BookingModule {}

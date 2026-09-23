INSERT INTO "booking_policies" (
  "id",
  "organization_id",
  "customer_cancellation_enabled",
  "customer_reschedule_enabled",
  "created_at",
  "updated_at"
)
SELECT gen_random_uuid(), "id", false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations"
ON CONFLICT ("organization_id") DO NOTHING;

ALTER TABLE "booking_policies"
  ADD CONSTRAINT "booking_policies_cancellation_cutoff_nonnegative"
    CHECK ("cancellation_cutoff_minutes" IS NULL OR "cancellation_cutoff_minutes" >= 0),
  ADD CONSTRAINT "booking_policies_reschedule_cutoff_nonnegative"
    CHECK ("reschedule_cutoff_minutes" IS NULL OR "reschedule_cutoff_minutes" >= 0),
  ADD CONSTRAINT "booking_policies_max_reschedules_nonnegative"
    CHECK ("max_customer_reschedules" IS NULL OR "max_customer_reschedules" >= 0);

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_booking_number_prefix_format"
    CHECK ("booking_number_prefix" ~ '^[A-Z0-9][A-Z0-9-]{0,15}$');

CREATE UNIQUE INDEX "booking_staff_active_assignment_key"
  ON "booking_staff" ("booking_service_id", "staff_id")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "booking_resources_active_assignment_key"
  ON "booking_resources" ("booking_service_id", "resource_id")
  WHERE "status" = 'ACTIVE';

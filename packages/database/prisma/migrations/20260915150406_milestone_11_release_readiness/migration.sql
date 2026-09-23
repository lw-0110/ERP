-- CreateEnum
CREATE TYPE "StaffInvitationStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "staff_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "StaffInvitationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "redeemed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitations_token_hash_key" ON "staff_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "staff_invitations_organization_id_staff_profile_id_status_idx" ON "staff_invitations"("organization_id", "staff_profile_id", "status");

-- CreateIndex
CREATE INDEX "staff_invitations_expires_at_status_idx" ON "staff_invitations"("expires_at", "status");

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_redeemed_by_user_id_fkey" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Release-query indexes. These match tenant-scoped status, customer, service, and date filters.
CREATE INDEX "bookings_organization_id_status_start_date_time_idx" ON "bookings"("organization_id", "status", "start_date_time");
CREATE INDEX "bookings_organization_id_customer_id_start_date_time_idx" ON "bookings"("organization_id", "customer_id", "start_date_time");
CREATE INDEX "booking_services_service_id_idx" ON "booking_services"("service_id");
CREATE INDEX "payment_records_organization_id_paid_at_idx" ON "payment_records"("organization_id", "paid_at");
CREATE INDEX "commission_records_organization_id_created_at_idx" ON "commission_records"("organization_id", "created_at");

-- Practical database invariants already required by application validation.
ALTER TABLE "services" ADD CONSTRAINT "services_valid_capacity_and_price" CHECK (
  "duration_minutes" > 0 AND "price_minor" >= 0 AND "required_staff_count" > 0
  AND "buffer_before_minutes" >= 0 AND "buffer_after_minutes" >= 0
);
ALTER TABLE "service_required_skills" ADD CONSTRAINT "service_required_skills_positive_count" CHECK ("required_count" > 0);
ALTER TABLE "service_required_resource_types" ADD CONSTRAINT "service_required_resource_types_positive_count" CHECK ("required_count" > 0);
ALTER TABLE "resources" ADD CONSTRAINT "resources_positive_capacity" CHECK ("capacity" > 0);
ALTER TABLE "organization_opening_hours" ADD CONSTRAINT "organization_opening_hours_valid" CHECK (
  "day_of_week" BETWEEN 0 AND 6 AND "open_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "close_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "open_time" < "close_time"
);
ALTER TABLE "staff_working_schedules" ADD CONSTRAINT "staff_working_schedules_valid" CHECK (
  "day_of_week" BETWEEN 0 AND 6 AND "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "start_time" < "end_time"
);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_order" CHECK ("end_date_time" > "start_date_time");
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_valid_snapshots" CHECK (
  "unit_price_minor_snapshot" >= 0 AND "duration_minutes_snapshot" > 0
  AND "buffer_before_minutes_snapshot" >= 0 AND "buffer_after_minutes_snapshot" >= 0
  AND "required_staff_count_snapshot" > 0 AND "quantity" > 0 AND "line_total_minor" >= 0
  AND jsonb_typeof("required_skill_ids_snapshot") = 'array'
  AND jsonb_typeof("required_skill_counts_snapshot") = 'array'
  AND jsonb_typeof("required_resource_type_counts_snapshot") = 'array'
);
ALTER TABLE "booking_staff" ADD CONSTRAINT "booking_staff_invalidation_consistency" CHECK (
  ("status" = 'ACTIVE' AND "invalidated_at" IS NULL AND "invalidation_reason" IS NULL)
  OR ("status" = 'INVALIDATED' AND "invalidated_at" IS NOT NULL AND "invalidation_reason" IS NOT NULL)
);
ALTER TABLE "booking_resources" ADD CONSTRAINT "booking_resources_invalidation_consistency" CHECK (
  ("status" = 'ACTIVE' AND "invalidated_at" IS NULL AND "invalidation_reason" IS NULL)
  OR ("status" = 'INVALIDATED' AND "invalidated_at" IS NOT NULL AND "invalidation_reason" IS NOT NULL)
);
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_lifecycle_consistency" CHECK (
  ("status" = 'ACTIVE' AND "used_at" IS NULL AND "revoked_at" IS NULL)
  OR ("status" = 'USED' AND "used_at" IS NOT NULL AND "redeemed_by_user_id" IS NOT NULL)
  OR ("status" IN ('EXPIRED', 'REVOKED') AND "used_at" IS NULL)
);
CREATE UNIQUE INDEX "staff_invitations_one_active_per_profile" ON "staff_invitations"("organization_id", "staff_profile_id") WHERE "status" = 'ACTIVE';

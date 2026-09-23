-- CreateEnum
CREATE TYPE "BookingChangeType" AS ENUM ('CANCELLED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "BookingChangeInitiator" AS ENUM ('CUSTOMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "BookingAssignmentStatus" AS ENUM ('ACTIVE', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "BookingAssignmentInvalidationReason" AS ENUM ('REPLACED', 'RESCHEDULE_CONFLICT');

-- DropIndex
DROP INDEX "booking_resources_booking_service_id_resource_id_key";

-- DropIndex
DROP INDEX "booking_staff_booking_service_id_staff_id_key";

-- AlterTable
ALTER TABLE "booking_resources" ADD COLUMN     "invalidated_at" TIMESTAMPTZ(6),
ADD COLUMN     "invalidation_reason" "BookingAssignmentInvalidationReason",
ADD COLUMN     "status" "BookingAssignmentStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "booking_staff" ADD COLUMN     "invalidated_at" TIMESTAMPTZ(6),
ADD COLUMN     "invalidation_reason" "BookingAssignmentInvalidationReason",
ADD COLUMN     "status" "BookingAssignmentStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "booking_number_prefix" TEXT NOT NULL DEFAULT 'BK';

-- CreateTable
CREATE TABLE "booking_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_cancellation_enabled" BOOLEAN NOT NULL DEFAULT false,
    "customer_reschedule_enabled" BOOLEAN NOT NULL DEFAULT false,
    "cancellation_cutoff_minutes" INTEGER,
    "reschedule_cutoff_minutes" INTEGER,
    "max_customer_reschedules" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_changes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "type" "BookingChangeType" NOT NULL,
    "initiated_by" "BookingChangeInitiator" NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "reason" TEXT,
    "previous_start_date_time" TIMESTAMPTZ(6),
    "previous_end_date_time" TIMESTAMPTZ(6),
    "new_start_date_time" TIMESTAMPTZ(6),
    "new_end_date_time" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_policies_organization_id_key" ON "booking_policies"("organization_id");

-- CreateIndex
CREATE INDEX "booking_changes_organization_id_booking_id_created_at_idx" ON "booking_changes"("organization_id", "booking_id", "created_at");

-- CreateIndex
CREATE INDEX "booking_changes_booking_id_type_initiated_by_idx" ON "booking_changes"("booking_id", "type", "initiated_by");

-- CreateIndex
CREATE INDEX "booking_resources_booking_service_id_status_idx" ON "booking_resources"("booking_service_id", "status");

-- CreateIndex
CREATE INDEX "booking_resources_resource_id_status_idx" ON "booking_resources"("resource_id", "status");

-- CreateIndex
CREATE INDEX "booking_staff_booking_service_id_status_idx" ON "booking_staff"("booking_service_id", "status");

-- CreateIndex
CREATE INDEX "booking_staff_staff_id_status_idx" ON "booking_staff"("staff_id", "status");

-- AddForeignKey
ALTER TABLE "booking_policies" ADD CONSTRAINT "booking_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_changes" ADD CONSTRAINT "booking_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_changes" ADD CONSTRAINT "booking_changes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_changes" ADD CONSTRAINT "booking_changes_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

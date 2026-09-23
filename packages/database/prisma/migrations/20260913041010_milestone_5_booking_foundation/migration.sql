-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUND_PENDING', 'REFUNDED');

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "resource_type_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "capacity" INTEGER NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_opening_hours" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "organization_opening_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_working_schedules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "staff_working_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "booking_number" TEXT NOT NULL,
    "start_date_time" TIMESTAMPTZ(6) NOT NULL,
    "end_date_time" TIMESTAMPTZ(6) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "customer_note" TEXT,
    "internal_note" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_services" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "unit_price_minor_snapshot" INTEGER NOT NULL,
    "currency_snapshot" CHAR(3) NOT NULL,
    "duration_minutes_snapshot" INTEGER NOT NULL,
    "buffer_before_minutes_snapshot" INTEGER NOT NULL,
    "buffer_after_minutes_snapshot" INTEGER NOT NULL,
    "required_staff_count_snapshot" INTEGER NOT NULL,
    "required_skill_ids_snapshot" JSONB NOT NULL,
    "required_skill_counts_snapshot" JSONB NOT NULL,
    "required_resource_type_counts_snapshot" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total_minor" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "booking_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_staff" (
    "id" UUID NOT NULL,
    "booking_service_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "assigned_by_user_id" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_resources" (
    "id" UUID NOT NULL,
    "booking_service_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "assigned_by_user_id" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resources_organization_id_status_idx" ON "resources"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "resources_organization_id_name_key" ON "resources"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "resources_organization_id_code_key" ON "resources"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "organization_opening_hours_organization_id_day_of_week_key" ON "organization_opening_hours"("organization_id", "day_of_week");

-- CreateIndex
CREATE INDEX "staff_working_schedules_organization_id_day_of_week_status_idx" ON "staff_working_schedules"("organization_id", "day_of_week", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_working_schedules_staff_id_day_of_week_key" ON "staff_working_schedules"("staff_id", "day_of_week");

-- CreateIndex
CREATE INDEX "bookings_organization_id_start_date_time_end_date_time_stat_idx" ON "bookings"("organization_id", "start_date_time", "end_date_time", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_organization_id_booking_number_key" ON "bookings"("organization_id", "booking_number");

-- CreateIndex
CREATE UNIQUE INDEX "booking_services_booking_id_sort_order_key" ON "booking_services"("booking_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "booking_staff_booking_service_id_staff_id_key" ON "booking_staff"("booking_service_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_resources_booking_service_id_resource_id_key" ON "booking_resources"("booking_service_id", "resource_id");

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_resource_type_id_fkey" FOREIGN KEY ("resource_type_id") REFERENCES "resource_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_opening_hours" ADD CONSTRAINT "organization_opening_hours_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_working_schedules" ADD CONSTRAINT "staff_working_schedules_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_staff" ADD CONSTRAINT "booking_staff_booking_service_id_fkey" FOREIGN KEY ("booking_service_id") REFERENCES "booking_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_staff" ADD CONSTRAINT "booking_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_resources" ADD CONSTRAINT "booking_resources_booking_service_id_fkey" FOREIGN KEY ("booking_service_id") REFERENCES "booking_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_resources" ADD CONSTRAINT "booking_resources_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

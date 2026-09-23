-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('INCOMPLETE', 'PRESENT');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "clock_in_at" TIMESTAMPTZ(6) NOT NULL,
    "clock_out_at" TIMESTAMPTZ(6),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "start_date_time" TIMESTAMPTZ(6) NOT NULL,
    "end_date_time" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "admin_note" TEXT,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_records_organization_id_work_date_idx" ON "attendance_records"("organization_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_records_staff_id_clock_in_at_idx" ON "attendance_records"("staff_id", "clock_in_at");

-- A staff member may have only one open clock-in, including under concurrent requests.
CREATE UNIQUE INDEX "attendance_records_one_open_per_staff" ON "attendance_records"("staff_id") WHERE "clock_out_at" IS NULL;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_clock_order" CHECK ("clock_out_at" IS NULL OR "clock_out_at" > "clock_in_at");

-- CreateIndex
CREATE INDEX "leave_types_organization_id_status_idx" ON "leave_types"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_organization_id_name_key" ON "leave_types"("organization_id", "name");

-- CreateIndex
CREATE INDEX "leave_requests_organization_id_status_start_date_time_end_d_idx" ON "leave_requests"("organization_id", "status", "start_date_time", "end_date_time");

-- CreateIndex
CREATE INDEX "leave_requests_staff_id_status_start_date_time_end_date_tim_idx" ON "leave_requests"("staff_id", "status", "start_date_time", "end_date_time");
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_time_order" CHECK ("end_date_time" > "start_date_time");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

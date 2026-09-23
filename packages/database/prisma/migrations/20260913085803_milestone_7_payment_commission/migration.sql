-- CreateEnum
CREATE TYPE "CommissionRuleStatus" AS ENUM ('DRAFT', 'ARCHIVED');

-- CreateTable
CREATE TABLE "payment_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_positive_amount" CHECK ("amount_minor" > 0);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "configuration" JSONB NOT NULL,
    "status" "CommissionRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_valid_draft" CHECK ("version" > 0 AND jsonb_typeof("configuration") = 'object');

-- CreateTable
CREATE TABLE "commission_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "booking_service_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "source_snapshot" JSONB NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "commission_records_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_positive_amount" CHECK ("amount_minor" > 0 AND jsonb_typeof("source_snapshot") = 'object');

-- CreateIndex
CREATE INDEX "payment_records_organization_id_booking_id_paid_at_idx" ON "payment_records"("organization_id", "booking_id", "paid_at");

-- CreateIndex
CREATE INDEX "commission_rules_organization_id_service_id_status_idx" ON "commission_rules"("organization_id", "service_id", "status");

-- CreateIndex
CREATE INDEX "commission_records_organization_id_booking_id_idx" ON "commission_records"("organization_id", "booking_id");

-- CreateIndex
CREATE INDEX "commission_records_organization_id_staff_id_created_at_idx" ON "commission_records"("organization_id", "staff_id", "created_at");
CREATE UNIQUE INDEX "commission_records_booking_service_id_staff_id_key" ON "commission_records"("booking_service_id", "staff_id");

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_booking_service_id_fkey" FOREIGN KEY ("booking_service_id") REFERENCES "booking_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_records" ADD CONSTRAINT "commission_records_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

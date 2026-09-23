-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "date_of_birth" DATE,
    "notes" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "employee_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "hire_date" DATE,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_skills" (
    "staff_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,

    CONSTRAINT "staff_skills_pkey" PRIMARY KEY ("staff_id","skill_id")
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "price_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "required_staff_count" INTEGER NOT NULL DEFAULT 1,
    "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0,
    "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_required_skills" (
    "service_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "required_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "service_required_skills_pkey" PRIMARY KEY ("service_id","skill_id")
);

-- CreateTable
CREATE TABLE "resource_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resource_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_required_resource_types" (
    "service_id" UUID NOT NULL,
    "resource_type_id" UUID NOT NULL,
    "required_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "service_required_resource_types_pkey" PRIMARY KEY ("service_id","resource_type_id")
);

-- CreateIndex
CREATE INDEX "customer_profiles_organization_id_status_idx" ON "customer_profiles"("organization_id", "status");

-- CreateIndex
CREATE INDEX "customer_profiles_organization_id_email_idx" ON "customer_profiles"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_organization_id_user_id_key" ON "customer_profiles"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "staff_profiles_organization_id_status_idx" ON "staff_profiles"("organization_id", "status");

-- CreateIndex
CREATE INDEX "staff_profiles_organization_id_email_idx" ON "staff_profiles"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_organization_id_user_id_key" ON "staff_profiles"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_organization_id_employee_code_key" ON "staff_profiles"("organization_id", "employee_code");

-- CreateIndex
CREATE INDEX "skills_organization_id_status_idx" ON "skills"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "skills_organization_id_name_key" ON "skills"("organization_id", "name");

-- CreateIndex
CREATE INDEX "staff_skills_skill_id_idx" ON "staff_skills"("skill_id");

-- CreateIndex
CREATE INDEX "service_categories_organization_id_status_idx" ON "service_categories"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_organization_id_name_key" ON "service_categories"("organization_id", "name");

-- CreateIndex
CREATE INDEX "services_organization_id_status_idx" ON "services"("organization_id", "status");

-- CreateIndex
CREATE INDEX "services_category_id_idx" ON "services"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_organization_id_name_key" ON "services"("organization_id", "name");

-- CreateIndex
CREATE INDEX "service_required_skills_skill_id_idx" ON "service_required_skills"("skill_id");

-- CreateIndex
CREATE INDEX "resource_types_organization_id_status_idx" ON "resource_types"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "resource_types_organization_id_name_key" ON "resource_types"("organization_id", "name");

-- CreateIndex
CREATE INDEX "service_required_resource_types_resource_type_id_idx" ON "service_required_resource_types"("resource_type_id");

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_skills" ADD CONSTRAINT "staff_skills_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_skills" ADD CONSTRAINT "staff_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_required_skills" ADD CONSTRAINT "service_required_skills_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_required_skills" ADD CONSTRAINT "service_required_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_types" ADD CONSTRAINT "resource_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_required_resource_types" ADD CONSTRAINT "service_required_resource_types_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_required_resource_types" ADD CONSTRAINT "service_required_resource_types_resource_type_id_fkey" FOREIGN KEY ("resource_type_id") REFERENCES "resource_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

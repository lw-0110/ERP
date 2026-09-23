ALTER TABLE "staff_invitations" ADD COLUMN "role_id" UUID;

ALTER TABLE "staff_invitations"
  ADD CONSTRAINT "staff_invitations_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "staff_invitations_role_id_idx" ON "staff_invitations"("role_id");

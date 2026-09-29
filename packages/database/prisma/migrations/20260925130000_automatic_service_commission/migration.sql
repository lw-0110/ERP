BEGIN;

-- Do not guess which staff member should retain an existing assignment.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM booking_staff WHERE status = 'ACTIVE'
    GROUP BY booking_service_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple active staff assignments exist for a Booking Service. Resolve them before applying this migration.';
  END IF;
END $$;

ALTER TABLE services ADD COLUMN commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE services ADD CONSTRAINT services_commission_percentage_range
  CHECK (commission_percentage >= 0 AND commission_percentage <= 100);

-- Retain all invalidated assignment history while enforcing the active limit.
CREATE UNIQUE INDEX booking_staff_one_active_per_service
  ON booking_staff (booking_service_id) WHERE status = 'ACTIVE';

DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE key = 'commission.record');
DELETE FROM permissions WHERE key = 'commission.record';

COMMIT;

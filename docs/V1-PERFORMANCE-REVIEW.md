# V1 performance and pagination review

This is a qualitative sanity review; no production-load benchmark is claimed.

- Customer, staff, service, notification, and audit lists use explicit pagination.
- Operational/configuration lists are bounded to 100 where full pagination would break the stable V1 contract; opening hours and weekly schedules are naturally bounded.
- Reporting requires a date range and caps its range; notification/audit APIs page results.
- Booking indexes cover tenant/status/start time and tenant/customer/start time. Payment and commission date indexes support reports. Assignment indexes cover active staff/resource lookup.
- Availability queries filter tenant, time overlap, status and active schedules before rebuilding immutable booking segments. No current-service requirement is loaded for historical reservations.
- The dashboard groups related counts in the reporting service. No external cache is justified for the initial single-instance pilot.

Before higher-volume rollout, add cursor pagination to remaining fixed-limit lists, capture slow-query logs, and benchmark availability/report queries with production-like anonymized volume.

# Decision log

- A membership has one role in V1; do not add `MembershipRole` yet.
- V1 serves one organization, retaining tenant-aware schema and boundaries for later expansion.
- Staff profiles may be created before account activation; their future `user_id` is nullable during onboarding.
- Booking services execute sequentially; total duration is service durations plus configured buffers.
- Future booking design includes `ServiceRequiredResourceType`; unassigned confirmed bookings reserve staff capacity.
- Permission keys are platform-defined; organizations assign them to roles only.
- Location hours are canonical; organization defaults may be configured later.
- Persist instants as `timestamptz`; use IANA location time zones for local schedules.
- Monetary amounts use integer minor units plus ISO currency code.
- Historically used roles are archived/disabled, not deleted.
- Audit records redact credentials, tokens, and sensitive PII. Cross-organization support is explicit and audited.
- Commission remains configurable and TBD.
- New customer registration receives the configured organization's active default Customer role without a seed rerun.
- Normal Staff activation uses an Admin-generated, manually delivered, expiring single-use URL; only its hash is stored. Existing accounts must authenticate as the invited email before linking.
- Production first-Admin creation uses a guarded operator command; demo seed/reset operations are explicitly non-production.
- V1 ships a minimal installable PWA shell and provider-neutral API/web container path; external notification delivery and advanced observability remain deferred.

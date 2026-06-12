-- Change requests: after the office plan is published, a pilot may need to
-- change a confirmed day (sick, private conflict, different time, swap, …).
-- Replaces ad-hoc WhatsApp messages with a structured email to the office.
--
-- Stored per-month on the existing availability_submissions row, keyed by the
-- affected date:
--   { "2026-07-18": { "reason": "sick", "note": "...",
--                     "status": "pending", "created_at": "...",
--                     "resolved_at": null } }
alter table availability_submissions
  add column if not exists change_requests jsonb not null default '{}'::jsonb;

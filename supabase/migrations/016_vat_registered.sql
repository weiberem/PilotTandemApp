-- VAT/MWST flag: when false the pilot is not VAT-registered, so the default
-- flight rate is 100 CHF instead of 105 (VAT-inclusive). The existing
-- numeric rate columns stay the source of truth — this flag only changes
-- placeholders, defaults for new pilots, and gates the half-yearly VAT
-- report cron.
alter table pilots
  add column if not exists vat_registered boolean not null default true;

-- Add support for a shared Einsatzplan FOLDER (Skywings drops a new file each month).
-- Sync prefers folder → newest file. einsatzplan_file_id remains supported as override
-- for the rare case where the pilot wants to pin one specific file.

alter table pilots
  add column if not exists einsatzplan_folder_id text;

-- Track which file we actually pulled in the last sync (for display).
alter table pilots
  add column if not exists einsatzplan_last_file_id text;
alter table pilots
  add column if not exists einsatzplan_last_file_name text;

-- ID from an external tracker (e.g. "original-3" in Product_Tracker.csv) so re-imports update instead of duplicating.
alter table tasks add column if not exists external_id text;
create unique index if not exists tasks_ws_external_id on tasks (workspace_id, external_id) where external_id is not null;

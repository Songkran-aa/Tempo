-- Keep the two remaining master-file columns: where the pet type came from, and how many source rows were merged.
alter table influencers add column if not exists type_source text;
alter table influencers add column if not exists merged_count integer;

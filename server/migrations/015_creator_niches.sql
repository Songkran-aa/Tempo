-- Creators aren't only pet accounts: each workspace keeps its own list of creator niches ("สาย"),
-- e.g. 🐱 แมว, 💄 บิวตี้, 🍜 อาหาร. influencers.pet_type now holds a niche key from that list (free text, no enum).
-- Seed every workspace with the niches its creators already use; the old Cat/Dog keys keep working unchanged.
alter table workspaces add column if not exists creator_niches jsonb not null default '[]';
update workspaces w set creator_niches = coalesce((
  select jsonb_agg(jsonb_build_object(
      'key', s.k,
      'label', case s.k when 'Cat' then 'แมว' when 'Dog' then 'หมา' when 'Cat & Dog' then 'แมวและหมา' else s.k end,
      'emoji', case s.k when 'Cat' then '🐱' when 'Dog' then '🐶' when 'Cat & Dog' then '🐾' else '🏷️' end)
    order by case s.k when 'Cat' then 1 when 'Dog' then 2 when 'Cat & Dog' then 3 else 4 end, s.k)
  from (select distinct pet_type as k from influencers i where i.workspace_id = w.id and coalesce(pet_type, '') <> '') s
), '[]'::jsonb)

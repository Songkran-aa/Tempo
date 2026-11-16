-- A creator can sit in several niches (e.g. 💄 บิวตี้ + 👶 แม่และเด็ก). influencers.niches holds the keys in order;
-- pet_type stays as the first one (the "main" niche: avatar icon, export sheet) so older code keeps working.
-- influencers.extra holds the values of each niche's own fields: { "<niche key>": { "<field key>": "value" } }.
alter table influencers add column if not exists niches jsonb not null default '[]'::jsonb;
alter table influencers add column if not exists extra jsonb not null default '{}'::jsonb;
update influencers set niches = jsonb_build_array(pet_type) where coalesce(pet_type, '') <> '' and niches = '[]'::jsonb;

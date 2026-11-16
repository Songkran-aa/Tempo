-- Influencer content category (e.g. "รีวิวทั่วไป / ไลฟ์สไตล์") — separate from pet_type.
alter table influencers add column if not exists category text;
create index if not exists influencers_ws_category on influencers (workspace_id, category);

-- Creator-hunting / production workflow on a collaboration:
-- pic = hunter / person in charge (may not be a member), source = where the creator was found,
-- lead_status = detailed outreach status as written by the team,
-- drafts [{id, label, link, qc}], posts [{id, date, posted, url}], followups [{id, label, at, done}]
alter table collaborations add column if not exists pic text;
alter table collaborations add column if not exists source text;
alter table collaborations add column if not exists lead_status text;
alter table collaborations add column if not exists contract boolean;
alter table collaborations add column if not exists affiliate_link_sent boolean;
alter table collaborations add column if not exists brief_sent boolean;
alter table collaborations add column if not exists tracking_number text;
alter table collaborations add column if not exists shipping_status text;
alter table collaborations add column if not exists drafts jsonb not null default '[]';
alter table collaborations add column if not exists posts jsonb not null default '[]';
alter table collaborations add column if not exists followups jsonb not null default '[]';

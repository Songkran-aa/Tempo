-- Creator form: each platform gets its own profile link (not only TikTok / Instagram), YouTube joins the list,
-- and contact channels are separate fields (LINE ID, phone, email) next to the free-text contact notes.
alter table influencers add column if not exists link_fb text;
alter table influencers add column if not exists link_x text;
alter table influencers add column if not exists link_lemon8 text;
alter table influencers add column if not exists link_youtube text;
alter table influencers add column if not exists followers_youtube integer;
alter table influencers add column if not exists contact_line text;
alter table influencers add column if not exists contact_phone text;
alter table influencers add column if not exists contact_email text;

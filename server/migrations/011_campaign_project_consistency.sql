-- Creator collaborations and expenses tied to a campaign take that campaign's project
-- (the API keeps this in sync from now on; this fixes rows written before).
update collaborations x set project_id = c.project_id
  from campaigns c
  where x.campaign_id = c.id and x.project_id is distinct from c.project_id;
update expenses x set project_id = c.project_id
  from campaigns c
  where x.campaign_id = c.id and x.project_id is distinct from c.project_id;

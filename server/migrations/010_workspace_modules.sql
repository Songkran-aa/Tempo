-- optional modules per workspace (inventory, partners). Existing workspaces that already use them keep them on.
alter table workspaces add column modules jsonb not null default '{}';
update workspaces w set modules = jsonb_build_object(
  'inventory', exists(select 1 from products p where p.workspace_id = w.id),
  'partners', exists(select 1 from partners p where p.workspace_id = w.id) or exists(select 1 from contracts c where c.workspace_id = w.id));

-- Each person works in their own space (a workspace kept behind the scenes, named after them);
-- people collaborate by sharing single projects, not whole accounts.
alter table workspaces add column if not exists personal boolean not null default false;

-- default-named workspaces ("พื้นที่ทำงานของ …" / "…'s workspace") become the owner's personal space, named after them now
update workspaces w set personal = true, name = u.name
  from users u
  where u.id = w.created_by and (w.name like 'พื้นที่ทำงานของ %' or w.name like '%''s workspace');

-- sharing a project with an email that has no account yet: they join that project when they sign up
create table if not exists project_invites (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'editor',
  invited_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, email)
);
create index if not exists project_invites_email_idx on project_invites (email);

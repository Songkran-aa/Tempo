-- Project sharing: give a registered user access to individual projects without joining the whole workspace.
-- Such a user gets a workspace membership with role 'guest' (sees only the projects shared with them).
create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  role text not null default 'editor',
  added_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_ws_user_idx on project_members(workspace_id, user_id);
create index project_members_user_idx on project_members(user_id);

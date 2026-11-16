-- Tempo schema v1

create table users (
  id uuid primary key,
  email text not null unique,
  name text not null,
  pass_hash text not null,
  lang text not null default 'th',
  theme text not null default 'auto',
  accent text not null default 'violet',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);
create index sessions_user_idx on sessions(user_id);
create index sessions_expires_idx on sessions(expires_at);

create table workspaces (
  id uuid primary key,
  name text not null,
  rev bigint not null default 1,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table memberships (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'editor',
  title text,
  color text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

create table invites (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'editor',
  invited_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);
create index invites_email_idx on invites(email);

create table projects (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  emoji text,
  color text,
  description text,
  owner_id uuid references users(id) on delete set null,
  start_date date,
  launch_date date,
  milestones jsonb not null default '[]',
  checklist jsonb not null default '[]',
  brief jsonb not null default '[]',
  position int not null default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_ws_idx on projects(workspace_id);

create table tasks (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  status text not null default 'todo',
  priority text not null default 'med',
  assignee_id uuid references users(id) on delete set null,
  due_date date,
  category text,
  notes text,
  link text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_ws_idx on tasks(workspace_id);
create index tasks_project_idx on tasks(project_id);
create index tasks_due_idx on tasks(workspace_id, due_date);

create table campaigns (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  channel text,
  objective text,
  status text not null default 'draft',
  start_date date,
  end_date date,
  budget numeric(14,2),
  spent numeric(14,2),
  kpi text,
  target text,
  owner_id uuid references users(id) on delete set null,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_ws_idx on campaigns(workspace_id);

create table influencers (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  code text,
  name text not null,
  aliases text,
  pet_name text,
  breed text,
  pet_type text,
  tier text,
  followers_max bigint,
  followers_ig bigint,
  followers_tiktok bigint,
  followers_fb bigint,
  followers_lemon8 bigint,
  followers_x bigint,
  likes_total bigint,
  link_tiktok text,
  link_ig text,
  link_other text,
  contact text,
  address text,
  brands text,
  history text,
  notes text,
  blacklisted boolean not null default false,
  blacklist_reason text,
  legacy_code text,
  sources text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index influencers_ws_code_idx on influencers(workspace_id, code);
create index influencers_ws_followers_idx on influencers(workspace_id, followers_max desc nulls last);
create index influencers_ws_type_idx on influencers(workspace_id, pet_type, tier);

create table collaborations (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  influencer_id uuid not null references influencers(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  title text,
  status text not null default 'shortlist',
  deal_type text,
  platform text,
  fee numeric(14,2),
  product_value numeric(14,2),
  deliverables text,
  post_date date,
  post_url text,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  owner_id uuid references users(id) on delete set null,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index collaborations_ws_idx on collaborations(workspace_id);
create index collaborations_inf_idx on collaborations(influencer_id);
create index collaborations_campaign_idx on collaborations(campaign_id);

create table activity (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  label text,
  at timestamptz not null default now()
);
create index activity_ws_idx on activity(workspace_id, at desc);

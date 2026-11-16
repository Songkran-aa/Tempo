-- ERP modules: partners & contracts (CRM), products & stock, expenses & approvals,
-- team calendar events, comments with @mentions, and per-user notifications (in-app + email).

create table partners (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null default 'supplier',
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  tax_id text,
  website text,
  tags text,
  notes text,
  log jsonb not null default '[]',
  owner_id uuid references users(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partners_ws_idx on partners(workspace_id);

create table contracts (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  partner_id uuid references partners(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  status text not null default 'draft',
  value numeric(14,2),
  start_date date,
  end_date date,
  link text,
  remind_days int not null default 30,
  owner_id uuid references users(id) on delete set null,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contracts_ws_idx on contracts(workspace_id);

create table products (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  sku text,
  name text not null,
  category text,
  unit text,
  cost numeric(14,2),
  price numeric(14,2),
  reorder_level int,
  barcode text,
  partner_id uuid references partners(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  active boolean not null default true,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_ws_idx on products(workspace_id);
create unique index products_ws_sku_idx on products(workspace_id, sku);

-- qty is always positive; kind gives the direction (in/return add, out/sample/damaged remove)
create table stock_moves (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  kind text not null default 'in',
  qty int not null,
  move_date date not null default current_date,
  partner_id uuid references partners(id) on delete set null,
  collaboration_id uuid references collaborations(id) on delete set null,
  unit_cost numeric(14,2),
  note text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stock_moves_ws_idx on stock_moves(workspace_id, move_date desc);
create index stock_moves_product_idx on stock_moves(product_id);

-- status: draft -> pending (approver) -> approved | rejected -> paid
create table expenses (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  kind text not null default 'expense',
  amount numeric(14,2) not null default 0,
  expense_date date,
  due_date date,
  status text not null default 'draft',
  partner_id uuid references partners(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  contract_id uuid references contracts(id) on delete set null,
  approver_id uuid references users(id) on delete set null,
  receipt_link text,
  notes text,
  submitted_at timestamptz,
  decided_by uuid references users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  paid_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_ws_idx on expenses(workspace_id);
create index expenses_approver_idx on expenses(approver_id, status);

create table events (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  event_date date not null,
  start_time text,
  end_time text,
  location text,
  link text,
  attendees jsonb not null default '[]',
  project_id uuid references projects(id) on delete cascade,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_ws_idx on events(workspace_id, event_date);

create table comments (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  user_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index comments_entity_idx on comments(workspace_id, entity, entity_id, created_at);

create table notifications (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  kind text not null,
  entity text,
  entity_id uuid,
  label text,
  body text,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc);
create index notifications_unread_idx on notifications(user_id) where read_at is null;
create index notifications_email_idx on notifications(created_at) where emailed_at is null;

alter table users add column if not exists notify_email boolean not null default true;
alter table users add column if not exists cal_token text;
create unique index if not exists users_cal_token_idx on users(cal_token);

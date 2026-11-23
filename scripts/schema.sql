create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Umum',
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  overhead numeric(12,2) not null default 0,
  stock integer not null default 0,
  unit text not null default 'pcs',
  min_stock integer not null default 5,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'g',
  cost_per_unit numeric(12,4) not null default 0
);

create table if not exists recipes (
  product_id uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity numeric(12,3) not null,
  primary key (product_id, ingredient_id)
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  total numeric(12,2) not null,
  paid numeric(12,2) not null,
  change numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null,
  qty integer not null,
  price numeric(12,2) not null,
  cost numeric(12,2) not null
);

create table if not exists stock_moves (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  type text not null check (type in ('in','out','sale','adjust')),
  qty integer not null,
  note text not null default '',
  sale_id uuid references sales(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists cash_entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null,
  category text not null default 'Umum',
  note text not null default '',
  sale_id uuid references sales(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table products add column if not exists sku text unique;

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_email text not null,
  opening_cash numeric(12,2) not null default 0,
  expected_cash numeric(12,2),
  counted_cash numeric(12,2),
  difference numeric(12,2),
  note text not null default '',
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table sales add column if not exists shift_id uuid references shifts(id) on delete set null;

alter table sales add column if not exists payment_method text not null default 'tunai'
  check (payment_method in ('tunai','qris','transfer'));
alter table sales add column if not exists voided_at timestamptz;
alter table sales add column if not exists voided_by text;

create table if not exists app_roles (
  user_id text primary key,
  email text not null,
  role text not null check (role in ('owner','kasir')),
  created_at timestamptz not null default now()
);

alter table app_roles add column if not exists status text not null default 'aktif'
  check (status in ('pending','aktif','nonaktif'));

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  amount numeric(12,2) not null,
  method text not null default 'tunai' check (method in ('tunai','qris','transfer')),
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table sales add column if not exists customer_id uuid references customers(id) on delete set null;
alter table sales drop constraint if exists sales_payment_method_check;
alter table sales add constraint sales_payment_method_check
  check (payment_method in ('tunai','qris','transfer','kasbon'));

alter table sales add column if not exists discount numeric(12,2) not null default 0;
alter table products add column if not exists pinned boolean not null default false;
alter table products add column if not exists image_url text not null default '';

create table if not exists settings (
  key text primary key,
  value text not null default ''
);

alter table sale_items add column if not exists note text not null default '';
alter table customers add column if not exists stamps integer not null default 0;
alter table customers add column if not exists stamps_total integer not null default 0;
alter table customers add column if not exists stamps_redeemed integer not null default 0;
alter table sales add column if not exists stamps_earned integer not null default 0;

create table if not exists held_orders (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  label text not null default '',
  items jsonb not null,
  customer_id uuid references customers(id) on delete set null,
  created_at timestamptz not null default now()
);
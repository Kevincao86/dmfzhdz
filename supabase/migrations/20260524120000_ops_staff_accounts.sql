-- 运营管控台登录账号（主账号 + 子账号）；仅 service_role 可读写，authenticated 不可见密码摘要。
create table if not exists public.ops_staff_accounts (
  id text primary key,
  phone text not null,
  display_name text not null default '',
  role text not null check (role in ('super_admin', 'sub_admin')),
  password_hash text not null,
  permissions jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_staff_accounts_phone_unique unique (phone)
);

create index if not exists ops_staff_accounts_phone_idx on public.ops_staff_accounts (phone);

alter table public.ops_staff_accounts enable row level security;

grant select, insert, update, delete on table public.ops_staff_accounts to service_role;

comment on table public.ops_staff_accounts is '运营管控台登录账号；密码为 SHA-256 十六进制摘要';

-- 灵祺达人/PR 统一账号：一微信 openid 对应唯一账号（可兼有达人ID与PRID，不可重复注册）
-- 在 ECS 执行: bash ~/app/scripts/ecs-fix-mp-account-auth.sh
-- 本机推送: ECS_HOST=admin@139.196.42.5 bash scripts/ecs-fix-mp-account-auth.sh --remote
create table if not exists public.mp_accounts (
  id uuid primary key default gen_random_uuid(),
  openid text unique,
  login_name text unique,
  password_hash text,
  password_salt text,
  active_role text not null default 'talent' check (active_role in ('talent', 'pr')),
  lingqi_talent_id text,
  lingqi_pr_id text,
  registry_member_id text,
  registry_pr_id text,
  wx_nick_name text default '',
  wx_avatar_url text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mp_accounts_lingqi_talent_idx on public.mp_accounts (lingqi_talent_id)
  where lingqi_talent_id is not null;
create index if not exists mp_accounts_lingqi_pr_idx on public.mp_accounts (lingqi_pr_id)
  where lingqi_pr_id is not null;

create table if not exists public.mp_auth_sessions (
  token text primary key,
  account_id uuid not null references public.mp_accounts (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists mp_auth_sessions_account_idx on public.mp_auth_sessions (account_id);

create table if not exists public.mp_wx_scan_tickets (
  ticket text primary key,
  status text not null default 'pending' check (status in ('pending', 'scanned', 'confirmed', 'expired')),
  openid text,
  account_id uuid references public.mp_accounts (id) on delete set null,
  session_token text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.mp_accounts is '达人撮合小程序/Web履约后台统一账号';
comment on table public.mp_wx_scan_tickets is 'Web 微信扫码登录票据（资质齐全后对接开放平台）';

-- ECS PostgREST（service_role）读写
grant select, insert, update, delete on public.mp_accounts to service_role;
grant select, insert, update, delete on public.mp_auth_sessions to service_role;
grant select, insert, update, delete on public.mp_wx_scan_tickets to service_role;

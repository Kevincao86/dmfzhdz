-- 达人/PR 账号本机数据云端同步（小程序 ↔ 履约 Web）：报名列表、资料草稿、消息通知
-- ECS: bash ~/app/scripts/ecs-fix-mp-account-auth.sh
create table if not exists public.mp_account_client_state (
  account_id uuid primary key references public.mp_accounts (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists mp_account_client_state_updated_idx
  on public.mp_account_client_state (updated_at desc);

comment on table public.mp_account_client_state is '达人撮合小程序与履约 Web 共享的本机态（报名/草稿/通知）';

alter table if exists public.mp_account_client_state disable row level security;

grant select, insert, update, delete on public.mp_account_client_state to service_role;

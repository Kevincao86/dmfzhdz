-- 商单日历 · 用户自定义登记事件（ECS PostgREST service_role 直写，星选 Web 与达人小程序同步）

create table if not exists public.mp_calendar_custom_events (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  owner_role text not null,
  title text not null,
  event_date_key text not null,
  time_label text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mp_calendar_custom_events_owner_idx
  on public.mp_calendar_custom_events (owner_key, event_date_key, created_at desc);

alter table public.mp_calendar_custom_events enable row level security;
alter table public.mp_calendar_custom_events disable row level security;

grant select, insert, update, delete on table public.mp_calendar_custom_events to service_role;

comment on table public.mp_calendar_custom_events is '商单日历用户自定义登记事件（达人/PR 各身份独立，星选 Web 与达人小程序同步）';

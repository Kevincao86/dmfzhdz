-- 商单日历 · 探店/交片提醒（ECS PostgREST service_role 直写）

create table if not exists public.mp_calendar_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  owner_role text not null,
  wx_open_id text,
  mp_order_id text not null,
  event_id text not null,
  event_kind text not null,
  event_date_key text not null,
  event_title text not null default '',
  store_name text not null default '',
  lead_preset text not null,
  remind_at timestamptz not null,
  status text not null default 'pending',
  channels jsonb not null default '[]'::jsonb,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (owner_key, event_id, lead_preset)
);

create index if not exists mp_calendar_reminders_owner_idx
  on public.mp_calendar_reminders (owner_key, status, created_at desc);

create index if not exists mp_calendar_reminders_due_idx
  on public.mp_calendar_reminders (status, remind_at)
  where status = 'pending';

alter table public.mp_calendar_reminders enable row level security;
alter table public.mp_calendar_reminders disable row level security;

grant select, insert, update, delete on table public.mp_calendar_reminders to service_role;

comment on table public.mp_calendar_reminders is '商单日历事件提醒（订阅消息 + 服务号模板）';

-- 商单日历 · 用户自定义商单标签（ECS PostgREST service_role 直写，MP/Web 同步）

create table if not exists public.mp_order_custom_labels (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  owner_role text not null,
  mp_order_id text not null,
  label_text text not null,
  color text not null default 'violet',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_key, mp_order_id)
);

create index if not exists mp_order_custom_labels_owner_idx
  on public.mp_order_custom_labels (owner_key, updated_at desc);

alter table public.mp_order_custom_labels enable row level security;
alter table public.mp_order_custom_labels disable row level security;

grant select, insert, update, delete on table public.mp_order_custom_labels to service_role;

comment on table public.mp_order_custom_labels is '商单日历用户自定义标签（达人/拍摄/剪辑/PR 各身份独立，MP 与星选 Web 同步）';

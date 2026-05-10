-- 运营台 / ERP 共用注册表快照（线上替代 .meoo-dev-sync/registry.json；仅 service_role 可读写）

create table if not exists public.ops_registry_snapshot (
  id smallint primary key default 1,
  registry jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint ops_registry_snapshot_singleton check (id = 1)
);

alter table public.ops_registry_snapshot enable row level security;

insert into public.ops_registry_snapshot (id, registry) values (1, '{}'::jsonb)
on conflict (id) do nothing;

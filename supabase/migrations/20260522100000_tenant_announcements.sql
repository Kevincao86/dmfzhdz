-- 运营公告推送：运营台发送，商户 ERP 铃铛收件箱展示

create type public.tenant_announcement_category as enum (
  'subscription_expiring',
  'platform_change'
);

create table if not exists public.tenant_announcements (
  id uuid primary key default gen_random_uuid(),
  category public.tenant_announcement_category not null,
  title text not null,
  body text not null,
  target_all boolean not null default false,
  recipient_count integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text null
);

create table if not exists public.tenant_announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.tenant_announcements (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (announcement_id, tenant_id)
);

create index if not exists tenant_announcement_deliveries_tenant_idx
  on public.tenant_announcement_deliveries (tenant_id, read_at nulls first);

create index if not exists tenant_announcement_deliveries_announcement_idx
  on public.tenant_announcement_deliveries (announcement_id);

alter table public.tenant_announcements enable row level security;
alter table public.tenant_announcement_deliveries enable row level security;

-- 商户成员可读自己的投递
create policy "announcement_deliveries_select_member"
  on public.tenant_announcement_deliveries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_announcement_deliveries.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "announcement_deliveries_update_read"
  on public.tenant_announcement_deliveries
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_announcement_deliveries.tenant_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_announcement_deliveries.tenant_id
        and m.user_id = auth.uid()
    )
  );

-- 商户成员可读已投递给自己的公告正文
create policy "announcements_select_via_delivery"
  on public.tenant_announcements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_announcement_deliveries d
      join public.tenant_members m on m.tenant_id = d.tenant_id
      where d.announcement_id = tenant_announcements.id
        and m.user_id = auth.uid()
    )
  );

grant select on public.tenant_announcements to authenticated;
grant select, update on public.tenant_announcement_deliveries to authenticated;

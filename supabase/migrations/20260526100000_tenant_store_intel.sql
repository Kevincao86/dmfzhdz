-- 租户门店经营情报（毛利率/经营类目、菜单价目条目）：Web 写入，小程序与 AI 网关读取，与浏览器 localStorage 同源。

create table if not exists public.tenant_store_intel (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  margin_config jsonb,
  menu_items jsonb not null default '[]'::jsonb,
  menu_store_name text,
  menu_item_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists tenant_store_intel_updated_at_idx
  on public.tenant_store_intel (updated_at desc);

alter table public.tenant_store_intel enable row level security;

create policy "tenant_store_intel_select_member"
  on public.tenant_store_intel
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_store_intel.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "tenant_store_intel_insert_member"
  on public.tenant_store_intel
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_store_intel.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "tenant_store_intel_update_member"
  on public.tenant_store_intel
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_store_intel.tenant_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_store_intel.tenant_id
        and m.user_id = auth.uid()
    )
  );

comment on table public.tenant_store_intel is
  '商户门店毛利/类目与菜单价目（不含大图），供小程序与 /api/meoo-ai-chat 注入经营情报。';

-- 租户级第三方商家绑定（抖音来客等）：密文凭证存 Supabase，换设备登录同一租户可自动恢复。
-- 凭证内容为服务端 sealed token（moo1...），需配合 MERCHANT_DOUYIN_SESSION_SECRET 解析；RLS 限制为租户成员。

create table if not exists public.tenant_merchant_bindings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null check (provider in ('douyin')),
  sealed_credentials text not null,
  client_key text,
  merchant_account_id text,
  account_display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create index if not exists tenant_merchant_bindings_tenant_id_idx
  on public.tenant_merchant_bindings (tenant_id);

alter table public.tenant_merchant_bindings enable row level security;

create policy "tenant_merchant_bindings_select_member"
  on public.tenant_merchant_bindings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_merchant_bindings.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "tenant_merchant_bindings_insert_member"
  on public.tenant_merchant_bindings
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_merchant_bindings.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "tenant_merchant_bindings_update_member"
  on public.tenant_merchant_bindings
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_merchant_bindings.tenant_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_merchant_bindings.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "tenant_merchant_bindings_delete_member"
  on public.tenant_merchant_bindings
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_merchant_bindings.tenant_id
        and m.user_id = auth.uid()
    )
  );

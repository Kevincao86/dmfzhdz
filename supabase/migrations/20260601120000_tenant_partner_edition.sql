-- 服务商版租户：edition 区分商家/服务商；客户商家账号独立表

alter table public.tenants
  add column if not exists edition text not null default 'merchant'
    check (edition in ('merchant', 'partner'));

comment on column public.tenants.edition is
  'merchant=商家版租户；partner=服务商版租户，可绑定代运营客户商家账号';

alter table public.tenant_merchant_bindings
  add column if not exists binding_role text not null default 'merchant'
    check (binding_role in ('merchant', 'service_provider'));

comment on column public.tenant_merchant_bindings.binding_role is
  'merchant=商家自有账号；service_provider=服务商在开放平台的服务商身份凭证';

create table if not exists public.tenant_partner_clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null check (provider in ('douyin', 'kuaishou', 'local_promotion', 'xhs_commercial')),
  client_label text,
  merchant_account_id text not null,
  account_display_name text,
  sealed_credentials text not null,
  client_key text,
  demo_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, merchant_account_id)
);

create index if not exists tenant_partner_clients_tenant_id_idx
  on public.tenant_partner_clients (tenant_id);

alter table public.tenant_partner_clients enable row level security;

create policy "tenant_partner_clients_select_member"
  on public.tenant_partner_clients
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_partner_clients.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "tenant_partner_clients_insert_member"
  on public.tenant_partner_clients
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_partner_clients.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "tenant_partner_clients_update_member"
  on public.tenant_partner_clients
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_partner_clients.tenant_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_partner_clients.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "tenant_partner_clients_delete_member"
  on public.tenant_partner_clients
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_partner_clients.tenant_id
        and m.user_id = auth.uid()
    )
  );

comment on table public.tenant_partner_clients is
  '服务商版：代运营客户在各平台的商家账号绑定（密文凭证）';

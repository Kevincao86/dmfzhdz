-- fws：林客客户商家「授权 + 代运营合作」开通进度

create table if not exists public.tenant_partner_linke_onboarding (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null default 'douyin' check (provider in ('douyin')),
  client_label text,
  out_shop_id text not null,
  invite_extra text not null,
  solution_key text not null default '1',
  permission_keys text[] not null default array['1', '16'],
  merchant_account_id text,
  poi_id text,
  auth_status text not null default 'pending'
    check (auth_status in ('pending', 'authorized', 'failed')),
  cooperation_status text not null default 'pending'
    check (cooperation_status in ('pending', 'created', 'confirmed', 'failed', 'skipped')),
  cooperation_order_id text,
  cooperation_error text,
  owner_agent_tenant_id uuid references public.tenants (id) on delete set null,
  created_by_tenant_id uuid references public.tenants (id) on delete set null,
  partner_client_id uuid references public.tenant_partner_clients (id) on delete set null,
  auth_url text,
  auth_webhook_msg_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, out_shop_id)
);

create index if not exists tenant_partner_linke_onboarding_tenant_idx
  on public.tenant_partner_linke_onboarding (tenant_id, updated_at desc);

alter table public.tenant_partner_linke_onboarding enable row level security;

create policy "tenant_partner_linke_onboarding_select_member"
  on public.tenant_partner_linke_onboarding
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_partner_linke_onboarding.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "tenant_partner_linke_onboarding_insert_member"
  on public.tenant_partner_linke_onboarding
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_partner_linke_onboarding.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "tenant_partner_linke_onboarding_update_member"
  on public.tenant_partner_linke_onboarding
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_partner_linke_onboarding.tenant_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_partner_linke_onboarding.tenant_id
        and m.user_id = auth.uid()
    )
  );

comment on table public.tenant_partner_linke_onboarding is
  '服务商版：林客 auth_with_bind 授权与代运营合作开通进度（Webhook 回写）';

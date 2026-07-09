-- fws 总代/子代层级：parent_tenant_id、partner_agent edition、客户归属、子代权益池

alter table public.tenants
  drop constraint if exists tenants_edition_check;

alter table public.tenants
  add constraint tenants_edition_check
  check (edition in ('merchant', 'partner', 'partner_agent'));

alter table public.tenants
  add column if not exists parent_tenant_id uuid references public.tenants (id) on delete set null;

create index if not exists tenants_parent_tenant_id_idx
  on public.tenants (parent_tenant_id)
  where parent_tenant_id is not null;

comment on column public.tenants.parent_tenant_id is
  'partner_agent 子代公司指向总代 tenants.id；总代为 null';

alter table public.tenant_partner_clients
  add column if not exists owner_agent_tenant_id uuid references public.tenants (id) on delete set null,
  add column if not exists created_by_tenant_id uuid references public.tenants (id) on delete set null;

create index if not exists tenant_partner_clients_owner_agent_idx
  on public.tenant_partner_clients (owner_agent_tenant_id)
  where owner_agent_tenant_id is not null;

comment on column public.tenant_partner_clients.owner_agent_tenant_id is
  '子代负责的客户：归属子代 tenant_id；总代直客为 null';
comment on column public.tenant_partner_clients.created_by_tenant_id is
  '录入该客户绑定的服务商租户（总代或子代）';

create table if not exists public.tenant_agent_entitlements (
  id uuid primary key default gen_random_uuid(),
  parent_tenant_id uuid not null references public.tenants (id) on delete cascade,
  agent_tenant_id uuid not null references public.tenants (id) on delete cascade,
  seat_limit int not null default 0,
  package_points_quota bigint not null default 0,
  recharge_points_quota bigint not null default 0,
  package_points_used bigint not null default 0,
  recharge_points_used bigint not null default 0,
  service_expire_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_tenant_id, agent_tenant_id)
);

create index if not exists tenant_agent_entitlements_agent_idx
  on public.tenant_agent_entitlements (agent_tenant_id);

alter table public.tenant_agent_entitlements enable row level security;

create policy "tenant_agent_entitlements_select_member"
  on public.tenant_agent_entitlements
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members m
      where m.user_id = auth.uid()
        and (m.tenant_id = tenant_agent_entitlements.parent_tenant_id
          or m.tenant_id = tenant_agent_entitlements.agent_tenant_id)
    )
  );

comment on table public.tenant_agent_entitlements is
  '总代向子代分配的席位与积分额度（子代扣费从此池扣减）';

-- 子代成员可读写总代 tenant_id 下、归属自己的客户绑定
create policy "tenant_partner_clients_agent_member"
  on public.tenant_partner_clients
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      join public.tenants t on t.id = m.tenant_id
      where m.user_id = auth.uid()
        and t.parent_tenant_id = tenant_partner_clients.tenant_id
        and tenant_partner_clients.owner_agent_tenant_id = m.tenant_id
    )
  )
  with check (
    exists (
      select 1
      from public.tenant_members m
      join public.tenants t on t.id = m.tenant_id
      where m.user_id = auth.uid()
        and t.parent_tenant_id = tenant_partner_clients.tenant_id
        and tenant_partner_clients.owner_agent_tenant_id = m.tenant_id
    )
  );

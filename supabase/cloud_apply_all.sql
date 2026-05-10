-- =============================================================================
-- 店魔方：云端 Supabase 一次性建表 / 增量脚本（合并 migrations，按依赖顺序）
--
-- 用法：Dashboard → SQL Editor → New query → 粘贴全文 → Run
--
-- 前提：本项目依赖 Supabase Auth（auth.users）。全新空库可直接执行。
-- 若某对象已存在：表/扩展多为 IF NOT EXISTS；策略会先 DROP 再 CREATE，可重复执行。
--
-- CLI 替代（需已 login + link）：在项目根目录执行 npm run supabase:migrate
-- =============================================================================

-- ---------- 20260508120000_tenants_and_members ----------
create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_status text not null default 'normal'
    check (account_status in ('normal', 'disabled', 'frozen')),
  trial_days integer not null default 0,
  official_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists tenant_members_user_id_idx on public.tenant_members (user_id);
create index if not exists tenant_members_tenant_id_idx on public.tenant_members (tenant_id);

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;

drop policy if exists "tenant_members_select_self" on public.tenant_members;
drop policy if exists "tenants_select_via_membership" on public.tenants;

create policy "tenant_members_select_self"
  on public.tenant_members
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "tenants_select_via_membership"
  on public.tenants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenants.id
        and m.user_id = auth.uid()
    )
  );

-- ---------- 20260508140000_meoo_ops_list_tenants_fn ----------
create or replace function public.meoo_ops_list_tenants()
returns table (
  tenant_id uuid,
  merchant_name text,
  login_name text,
  user_email text,
  account_status text,
  trial_days integer,
  official_days integer,
  created_at timestamptz,
  updated_at timestamptz,
  owner_user_id uuid
)
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    t.id,
    t.name,
    coalesce(u.raw_user_meta_data->>'login_name', split_part(u.email::text, '@', 1)),
    u.email::text,
    t.account_status::text,
    t.trial_days,
    t.official_days,
    t.created_at,
    t.updated_at,
    m.user_id
  from public.tenants t
  inner join public.tenant_members m on m.tenant_id = t.id and m.role = 'owner'
  inner join auth.users u on u.id = m.user_id;
$$;

revoke all on function public.meoo_ops_list_tenants() from public;
grant execute on function public.meoo_ops_list_tenants() to service_role;

-- ---------- 20260510120000_payment_orders_wallet ----------
alter table public.tenants
  add column if not exists wallet_balance_cents bigint not null default 0 check (wallet_balance_cents >= 0);

alter table public.tenants
  add column if not exists service_expire_at timestamptz;

create table if not exists public.merchant_payment_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by_user_id uuid references auth.users (id) on delete set null,
  order_kind text not null check (order_kind in ('subscription', 'recharge')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'CNY',
  pay_channel text,
  client_note text,
  status text not null default 'pending'
    check (status in ('pending', 'amount_verified', 'confirmed', 'cancelled')),
  verified_amount_cents bigint check (verified_amount_cents is null or verified_amount_cents > 0),
  verified_at timestamptz,
  confirmed_at timestamptz,
  extend_days_applied integer,
  wallet_credit_cents_applied bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists merchant_payment_orders_tenant_id_idx
  on public.merchant_payment_orders (tenant_id);
create index if not exists merchant_payment_orders_status_idx
  on public.merchant_payment_orders (status);
create index if not exists merchant_payment_orders_created_at_idx
  on public.merchant_payment_orders (created_at desc);

create table if not exists public.tenant_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  delta_cents bigint not null,
  balance_after_cents bigint not null,
  reason text not null,
  ref_order_id uuid references public.merchant_payment_orders (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tenant_wallet_ledger_tenant_id_idx
  on public.tenant_wallet_ledger (tenant_id);
create index if not exists tenant_wallet_ledger_created_at_idx
  on public.tenant_wallet_ledger (created_at desc);

alter table public.merchant_payment_orders enable row level security;
alter table public.tenant_wallet_ledger enable row level security;

drop policy if exists "merchant_payment_orders_insert_member" on public.merchant_payment_orders;
drop policy if exists "merchant_payment_orders_select_member" on public.merchant_payment_orders;
drop policy if exists "tenant_wallet_ledger_select_member" on public.tenant_wallet_ledger;

create policy "merchant_payment_orders_insert_member"
  on public.merchant_payment_orders
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = merchant_payment_orders.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "merchant_payment_orders_select_member"
  on public.merchant_payment_orders
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = merchant_payment_orders.tenant_id
        and m.user_id = auth.uid()
    )
  );

create policy "tenant_wallet_ledger_select_member"
  on public.tenant_wallet_ledger
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_wallet_ledger.tenant_id
        and m.user_id = auth.uid()
    )
  );

-- ---------- 20260510140000_refund_order_kind ----------
do $$
declare
  r record;
begin
  for r in
    select c.conname as name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'merchant_payment_orders'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%order_kind%'
  loop
    execute format('alter table public.merchant_payment_orders drop constraint %I', r.name);
  end loop;
end $$;

alter table public.merchant_payment_orders
  drop constraint if exists merchant_payment_orders_order_kind_check;

alter table public.merchant_payment_orders
  add constraint merchant_payment_orders_order_kind_check
  check (order_kind in ('subscription', 'recharge', 'refund'));

-- ERP 租户积分（套餐桶 + 充值桶）、积分流水、在线支付字段

alter table public.tenants
  add column if not exists erp_package_points_balance bigint not null default 0
    check (erp_package_points_balance >= 0);

alter table public.tenants
  add column if not exists erp_recharge_points_balance bigint not null default 0
    check (erp_recharge_points_balance >= 0);

alter table public.tenants
  add column if not exists erp_points_gift_month text;

alter table public.tenants
  add column if not exists erp_points_gift_granted_month bigint not null default 0
    check (erp_points_gift_granted_month >= 0);

create table if not exists public.tenant_points_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  delta_package_points bigint not null default 0,
  delta_recharge_points bigint not null default 0,
  balance_package_after bigint not null default 0,
  balance_recharge_after bigint not null default 0,
  reason text not null,
  usage_kind text,
  ref_order_id uuid references public.merchant_payment_orders (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tenant_points_ledger_tenant_id_idx
  on public.tenant_points_ledger (tenant_id);
create index if not exists tenant_points_ledger_created_at_idx
  on public.tenant_points_ledger (tenant_id, created_at desc);

alter table public.merchant_payment_orders
  add column if not exists out_trade_no text;

alter table public.merchant_payment_orders
  add column if not exists pay_mode text;

alter table public.merchant_payment_orders
  add column if not exists pay_source text not null default 'manual';

alter table public.merchant_payment_orders
  add column if not exists transaction_id text;

alter table public.merchant_payment_orders
  add column if not exists points_credit_applied bigint;

create unique index if not exists merchant_payment_orders_out_trade_no_uidx
  on public.merchant_payment_orders (out_trade_no)
  where out_trade_no is not null;

-- order_kind 扩展：points_recharge
do $$
declare
  r record;
begin
  for r in
    select c.conname as name
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
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
  check (order_kind in ('subscription', 'recharge', 'refund', 'points_recharge'));

alter table public.merchant_payment_orders
  drop constraint if exists merchant_payment_orders_pay_source_check;

alter table public.merchant_payment_orders
  add constraint merchant_payment_orders_pay_source_check
  check (pay_source in ('manual', 'online'));

alter table public.tenant_points_ledger enable row level security;

drop policy if exists "tenant_points_ledger_select_member" on public.tenant_points_ledger;

create policy "tenant_points_ledger_select_member"
  on public.tenant_points_ledger
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenant_points_ledger.tenant_id
        and m.user_id = auth.uid()
    )
  );

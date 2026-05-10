-- 商家支付订单（订阅 / 充值）、钱包余额与流水；运营端 Service Role 确认到账后延长服务或入账。

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

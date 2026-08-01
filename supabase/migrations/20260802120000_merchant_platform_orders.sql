-- 商家多平台来客/团购逐单落库（一期：抖音来客）
create table if not exists public.merchant_platform_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  platform text not null,
  order_id text not null,
  sku_id text not null default '',
  sku_name text not null default '',
  product_id text not null default '',
  category_l1 text not null default '',
  category_l2 text not null default '',
  category_l3 text not null default '',
  pay_amount_fen bigint not null default 0,
  refund_amount_fen bigint not null default 0,
  coupon_count integer not null default 1,
  order_status integer,
  pay_time timestamptz,
  verify_time timestamptz,
  open_id text not null default '',
  raw_json jsonb,
  synced_at timestamptz not null default now(),
  unique (tenant_id, platform, order_id)
);

create index if not exists merchant_platform_orders_tenant_pay_idx
  on public.merchant_platform_orders (tenant_id, platform, pay_time desc);

create index if not exists merchant_platform_orders_tenant_openid_idx
  on public.merchant_platform_orders (tenant_id, platform, open_id)
  where open_id <> '';

create index if not exists merchant_platform_orders_tenant_product_idx
  on public.merchant_platform_orders (tenant_id, product_id);

alter table public.merchant_platform_orders enable row level security;

drop policy if exists "merchant_platform_orders_select_member" on public.merchant_platform_orders;
create policy "merchant_platform_orders_select_member"
  on public.merchant_platform_orders
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = merchant_platform_orders.tenant_id
        and m.user_id = auth.uid()
    )
  );

comment on table public.merchant_platform_orders is
  '商家平台团购逐单（抖音来客等），供财务明细与店铺分析；写入走 service_role。';

grant select, insert, update, delete on public.merchant_platform_orders to service_role;
grant select on public.merchant_platform_orders to authenticated;

-- 订单增加门店字段，支持单店筛选分析
alter table public.merchant_platform_orders
  add column if not exists poi_id text not null default '',
  add column if not exists poi_name text not null default '';

create index if not exists merchant_platform_orders_tenant_poi_idx
  on public.merchant_platform_orders (tenant_id, platform, poi_id)
  where poi_id <> '';

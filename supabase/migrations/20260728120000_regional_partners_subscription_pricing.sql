-- 区域服务商：代理城市内订阅加价价目（单位分；须 ≥ 平台底价）

alter table public.regional_partners
  add column if not exists subscription_pricing jsonb not null default '{}'::jsonb;

comment on column public.regional_partners.subscription_pricing is
  '按城市的订阅加价：{ "宁波市": { "member_monthly": 18800, ... } }；缺键用平台默认；值须≥平台底价';

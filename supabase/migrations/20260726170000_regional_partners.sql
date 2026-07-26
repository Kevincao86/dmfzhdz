-- 区域服务商（城市代理）账号与商家归因；仅 service_role 可读写。

create table if not exists public.regional_partners (
  id text primary key,
  company_name text not null default '',
  phone text not null,
  password_hash text not null,
  cities jsonb not null default '[]'::jsonb,
  permissions jsonb not null default '["dashboard","merchants","settlement"]'::jsonb,
  partner_share_rate numeric(5,4) not null default 0.8000
    check (partner_share_rate >= 0 and partner_share_rate <= 1),
  platform_share_rate numeric(5,4) not null default 0.2000
    check (platform_share_rate >= 0 and platform_share_rate <= 1),
  status text not null default 'active' check (status in ('active', 'disabled')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regional_partners_phone_unique unique (phone),
  constraint regional_partners_share_sum_check
    check (abs((partner_share_rate + platform_share_rate) - 1) < 0.0001)
);

create index if not exists regional_partners_phone_idx on public.regional_partners (phone);
create index if not exists regional_partners_status_idx on public.regional_partners (status);

alter table public.regional_partners enable row level security;

grant select, insert, update, delete on table public.regional_partners to service_role;

comment on table public.regional_partners is '区域服务商（城市代理）登录账号；密码为 SHA-256 十六进制摘要；cities 为 [{province,city}]';

-- 商家租户归因到区域服务商
alter table public.tenants
  add column if not exists regional_partner_id text references public.regional_partners (id) on delete set null;

alter table public.tenants
  add column if not exists attribution_city text;

create index if not exists tenants_regional_partner_id_idx
  on public.tenants (regional_partner_id)
  where regional_partner_id is not null;

-- 商家 / FWS 租户注册归属城市（供区域服务商按城查看与编辑）

alter table public.tenants
  add column if not exists register_province text;

alter table public.tenants
  add column if not exists register_city text;

create index if not exists tenants_register_city_idx
  on public.tenants (register_city)
  where register_city is not null and register_city <> '';

comment on column public.tenants.register_province is '注册/归属省份（区域服务商城市范围）';
comment on column public.tenants.register_city is '注册/归属城市（区域服务商城市范围）';

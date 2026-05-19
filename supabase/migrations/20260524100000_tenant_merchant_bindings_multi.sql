-- 同一租户可绑定多家抖音来客 / 多家巨量本地推（账号彼此独立）

alter table public.tenant_merchant_bindings
  drop constraint if exists tenant_merchant_bindings_tenant_id_provider_key;

alter table public.tenant_merchant_bindings
  drop constraint if exists tenant_merchant_bindings_provider_check;

alter table public.tenant_merchant_bindings
  add constraint tenant_merchant_bindings_provider_check
  check (provider in ('douyin', 'local_promotion'));

alter table public.tenant_merchant_bindings
  add column if not exists binding_label text null;

alter table public.tenant_merchant_bindings
  add column if not exists demo_mode boolean not null default false;

create unique index if not exists tenant_merchant_bindings_account_uidx
  on public.tenant_merchant_bindings (tenant_id, provider, merchant_account_id);

comment on column public.tenant_merchant_bindings.provider is
  'douyin=抖音来客；local_promotion=巨量本地推（与来客账号无关）';

comment on column public.tenant_merchant_bindings.merchant_account_id is
  'douyin 为来客商户号；local_promotion 为 local_account_id';

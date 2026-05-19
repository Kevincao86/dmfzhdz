-- 小红书商业化（聚光 + 种小草共用授权）

alter table public.tenant_merchant_bindings
  drop constraint if exists tenant_merchant_bindings_provider_check;

alter table public.tenant_merchant_bindings
  add constraint tenant_merchant_bindings_provider_check
  check (provider in ('douyin', 'local_promotion', 'xhs_commercial'));

comment on column public.tenant_merchant_bindings.provider is
  'douyin=抖音来客；local_promotion=巨量本地推；xhs_commercial=小红书聚光/种小草（同一广告主授权）';

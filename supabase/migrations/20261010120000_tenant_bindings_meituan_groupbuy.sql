-- 美团团购加入租户平台绑定，供电脑端与商家小程序读取同一份凭证。

alter table public.tenant_merchant_bindings
  drop constraint if exists tenant_merchant_bindings_provider_check;

alter table public.tenant_merchant_bindings
  add constraint tenant_merchant_bindings_provider_check
  check (provider in ('douyin', 'local_promotion', 'xhs_commercial', 'meituan'));

comment on column public.tenant_merchant_bindings.provider is
  'douyin=抖音来客；local_promotion=巨量本地推；xhs_commercial=小红书聚光/种小草；meituan=美团团购';

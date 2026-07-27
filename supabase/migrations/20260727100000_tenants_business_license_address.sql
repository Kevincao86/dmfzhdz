-- 商户主体营业执照住所（区域服务商开户时校验城市归属）

alter table public.tenants
  add column if not exists business_license_address text;

comment on column public.tenants.business_license_address is
  '营业执照住所/经营场所地址原文；用于校验是否命中区域服务商代理城市';

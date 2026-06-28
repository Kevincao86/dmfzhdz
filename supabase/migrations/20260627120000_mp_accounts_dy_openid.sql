-- 抖音小程序 openid 独立字段，与微信 openid 共存于同一 mp_accounts（手机号 login_name 统一账号）
alter table public.mp_accounts
  add column if not exists dy_openid text;

create unique index if not exists mp_accounts_dy_openid_uidx
  on public.mp_accounts (dy_openid)
  where dy_openid is not null;

comment on column public.mp_accounts.dy_openid is '抖音小程序 openid；微信 openid 仍在 openid 列';

-- 达人/PR 账号：手机号与邮箱分开存放，不再互相覆盖 login_name。
-- 不合并、不删除已有账号。login_name 仍保留，手机号优先，供旧查询兜底。
alter table public.mp_accounts add column if not exists phone text;
alter table public.mp_accounts add column if not exists email text;

update public.mp_accounts
set phone = login_name
where phone is null
  and login_name ~ '^1[3-9][0-9]{9}$';

update public.mp_accounts
set email = lower(login_name)
where email is null
  and login_name ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
  and login_name !~* '@users\.meoo\.test$';

create unique index if not exists mp_accounts_phone_uidx
  on public.mp_accounts (phone)
  where phone is not null and phone <> '';

create unique index if not exists mp_accounts_email_uidx
  on public.mp_accounts (email)
  where email is not null and email <> '';

comment on column public.mp_accounts.phone is '登录手机号，与 email 可同时存在';
comment on column public.mp_accounts.email is '登录邮箱，与 phone 可同时存在';

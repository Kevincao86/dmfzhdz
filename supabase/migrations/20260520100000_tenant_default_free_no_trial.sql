-- 取消试用：新租户默认免费版；不再默认赠送试用天数

alter table public.tenants
  alter column membership_plan set default 'free';

alter table public.tenants
  alter column trial_days set default 0;

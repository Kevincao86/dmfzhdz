-- 商家进阶版：¥368/月，每平台 5 个账号。168 会员版改为每平台 1 个账号。

alter table public.tenants drop constraint if exists tenants_membership_plan_check;

alter table public.tenants
  add constraint tenants_membership_plan_check
  check (membership_plan in ('free', 'member', 'member_store', 'member_plus'));

comment on column public.tenants.membership_plan is
  'free | member(168, 1账号) | member_store(368, 5账号) | member_plus(598, 50账号)';

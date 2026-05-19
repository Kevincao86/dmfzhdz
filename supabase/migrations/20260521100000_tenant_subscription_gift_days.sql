-- 订阅权益（订单确认累加，运营不可改）+ 运营赠送权益（运营可改）
alter table public.tenants
  add column if not exists subscription_days integer not null default 0,
  add column if not exists ops_gift_days integer not null default 0;

comment on column public.tenants.subscription_days is '订阅确认累加天数（购买会员/Plus 后自动增加，运营端只读）';
comment on column public.tenants.ops_gift_days is '运营赠送天数（客户编辑可调整）';

-- 历史数据：原 official_days 视为订阅累计
update public.tenants
set
  subscription_days = greatest(0, coalesce(official_days, 0)),
  ops_gift_days = 0
where subscription_days = 0 and ops_gift_days = 0 and coalesce(official_days, 0) > 0;

grant select (subscription_days, ops_gift_days) on public.tenants to authenticated;

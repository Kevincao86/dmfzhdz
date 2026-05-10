-- 支持商家发起退款申报（order_kind = refund），运营核对并确认后从钱包扣减。

do $$
declare
  r record;
begin
  for r in
    select c.conname as name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'merchant_payment_orders'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%order_kind%'
  loop
    execute format('alter table public.merchant_payment_orders drop constraint %I', r.name);
  end loop;
end $$;

alter table public.merchant_payment_orders
  add constraint merchant_payment_orders_order_kind_check
  check (order_kind in ('subscription', 'recharge', 'refund'));

-- 招募大厅：已停止（closed）与星选「已停止」一致，应对达人可见
create or replace function public.mp_talent_fetch_hall_registry()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg jsonb;
  v_mp jsonb := '[]'::jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_inbox jsonb := '[]'::jsonb;
  v_members jsonb := '[]'::jsonb;
  v_ref_ids text[] := array[]::text[];
begin
  select registry into v_reg from public.ops_registry_snapshot where id = 1 limit 1;

  if v_reg is null then
    return jsonb_build_object(
      'ok', true,
      'mpRecruitmentOrders', '[]'::jsonb,
      'recruitmentOrders', '[]'::jsonb,
      'recruitmentScheduleRows', '[]'::jsonb,
      'recruitmentVideoSubmissions', '[]'::jsonb,
      'mpTalentInbox', '[]'::jsonb,
      'mpTalentMembers', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(elem), '[]'::jsonb)
  into v_mp
  from jsonb_array_elements(coalesce(v_reg->'mpRecruitmentOrders', '[]'::jsonb)) elem
  where coalesce(elem->>'status', '') in ('open', 'collecting', 'closed');

  select coalesce(array_agg(distinct trim(elem->>'sourceMerchantOrderId')), array[]::text[])
  into v_ref_ids
  from jsonb_array_elements(v_mp) elem
  where coalesce(trim(elem->>'sourceMerchantOrderId'), '') <> '';

  if v_ref_ids is not null and array_length(v_ref_ids, 1) > 0 then
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
    into v_orders
    from jsonb_array_elements(coalesce(v_reg->'recruitmentOrders', '[]'::jsonb)) elem
    where coalesce(elem->>'id', '') = any(v_ref_ids);
  end if;

  select coalesce(jsonb_agg(x), '[]'::jsonb)
  into v_inbox
  from (
    select elem as x
    from jsonb_array_elements(coalesce(v_reg->'mpTalentInbox', '[]'::jsonb)) elem
    limit 400
  ) s;

  v_members := coalesce(v_reg->'mpTalentMembers', '[]'::jsonb);

  return jsonb_build_object(
    'ok', true,
    'mpRecruitmentOrders', v_mp,
    'recruitmentOrders', v_orders,
    'recruitmentScheduleRows', '[]'::jsonb,
    'recruitmentVideoSubmissions', '[]'::jsonb,
    'mpTalentInbox', v_inbox,
    'mpTalentMembers', v_members
  );
end;
$$;

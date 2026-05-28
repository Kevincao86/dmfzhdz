-- PR 推荐达人：双方均发过消息时标记「已沟通」

create or replace function public.mp_talent_chat_pr_mutual_talent_keys(p_key text, p_secret text)
returns setof text
language sql
security definer
set search_path = public
stable
as $$
  select distinct s.talent_key
  from public.mp_talent_chat_sessions s
  where public.mp_talent_chat_verify_secret(p_key, p_secret)
    and s.pr_key = p_key
    and exists (
      select 1
      from public.mp_talent_chat_messages m
      where m.session_id = s.id and m.from_role = 'pr'
    )
    and exists (
      select 1
      from public.mp_talent_chat_messages m
      where m.session_id = s.id and m.from_role = 'talent'
    );
$$;

revoke all on function public.mp_talent_chat_pr_mutual_talent_keys(text, text) from public;
grant execute on function public.mp_talent_chat_pr_mutual_talent_keys(text, text) to anon, authenticated;

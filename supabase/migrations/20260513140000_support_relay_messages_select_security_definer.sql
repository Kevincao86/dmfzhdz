-- 修复商家端无法 SELECT 到本会话内 ops 消息的问题：
-- 原策略在同表 EXISTS 子查询中受 RLS 递归可见性影响，可能导致 merchant 轮询/Realtime 拿不到运营回复。
-- 使用 SECURITY DEFINER 函数在绕过 RLS 的扫描中仅判断「当前 JWT 是否在该 session_id 下有过 author 行」。

create or replace function public.support_relay_user_participates_in_session(p_session_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.support_relay_messages m
    where m.session_id = p_session_id
      and m.author_user_id is not distinct from auth.uid()
  );
$$;

revoke all on function public.support_relay_user_participates_in_session(text) from public;
grant execute on function public.support_relay_user_participates_in_session(text) to authenticated;

drop policy if exists "support_relay_messages_select_participant" on public.support_relay_messages;

create policy "support_relay_messages_select_participant"
  on public.support_relay_messages
  for select
  to authenticated
  using (public.support_relay_user_participates_in_session(session_id));

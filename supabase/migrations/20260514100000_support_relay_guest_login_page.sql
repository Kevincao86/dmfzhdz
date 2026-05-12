-- 登录页（anon）在线客服：写入带 guest_fingerprint，经 SECURITY DEFINER 函数拉取本会话全量消息。

alter table public.support_relay_messages
  add column if not exists guest_fingerprint text;

drop policy if exists "support_relay_messages_insert_anon_guest" on public.support_relay_messages;

create policy "support_relay_messages_insert_anon_guest"
  on public.support_relay_messages
  for insert
  to anon
  with check (
    author_user_id is null
    and guest_fingerprint is not null
    and length(trim(guest_fingerprint)) >= 16
    and from_role in ('user', 'bot', 'agent', 'system')
  );

grant insert on public.support_relay_messages to anon;

drop function if exists public.support_relay_guest_fetch_session(text, text);

create or replace function public.support_relay_guest_fetch_session(p_session_id text, p_guest_fingerprint text)
returns setof public.support_relay_messages
language sql
security definer
set search_path = public
stable
as $$
  select m.*
  from public.support_relay_messages m
  where m.session_id = p_session_id
    and length(trim(p_guest_fingerprint)) >= 16
    and exists (
      select 1
      from public.support_relay_messages a
      where a.session_id = p_session_id
        and a.guest_fingerprint = p_guest_fingerprint
    );
$$;

revoke all on function public.support_relay_guest_fetch_session(text, text) from public;
grant execute on function public.support_relay_guest_fetch_session(text, text) to anon;

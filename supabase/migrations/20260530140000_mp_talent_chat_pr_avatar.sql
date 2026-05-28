-- PR 会话列表头像 + 资料同步时刷新会话展示名/头像
-- 重要：必须先成功执行下方 ALTER（或先跑 20260530150000_mp_talent_chat_pr_avatar_column.sql），
-- 再执行本文件其余 SQL。勿只选中 list_sessions 片段执行。

alter table public.mp_talent_chat_sessions
  add column if not exists pr_avatar text;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mp_talent_chat_sessions'
      and column_name = 'pr_avatar'
  ) then
    raise exception '缺少列 mp_talent_chat_sessions.pr_avatar，请先执行: alter table public.mp_talent_chat_sessions add column if not exists pr_avatar text;';
  end if;
end;
$$;

create or replace function public.mp_talent_chat_upsert_participant(
  p_key text,
  p_role text,
  p_secret text,
  p_display_name text,
  p_avatar_url text,
  p_member_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role not in ('pr', 'talent') or length(trim(p_key)) < 2 or length(trim(p_secret)) < 16 then
    raise exception 'invalid_participant';
  end if;
  insert into public.mp_talent_chat_participants (
    participant_key, role, display_name, avatar_url, member_snapshot, device_secret, updated_at
  ) values (
    p_key, p_role, coalesce(p_display_name, ''), p_avatar_url, p_member_snapshot, p_secret, now()
  )
  on conflict (participant_key) do update set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    member_snapshot = coalesce(excluded.member_snapshot, mp_talent_chat_participants.member_snapshot),
    device_secret = excluded.device_secret,
    updated_at = now();

  if p_role = 'talent' then
    update public.mp_talent_chat_sessions set
      talent_name = coalesce(nullif(trim(p_display_name), ''), talent_name),
      talent_avatar = coalesce(p_avatar_url, talent_avatar),
      updated_at = now()
    where talent_key = p_key;
  else
    update public.mp_talent_chat_sessions set
      pr_name = coalesce(nullif(trim(p_display_name), ''), pr_name),
      pr_avatar = coalesce(p_avatar_url, pr_avatar),
      updated_at = now()
    where pr_key = p_key;
  end if;
end;
$$;

create or replace function public.mp_talent_chat_list_sessions(p_key text, p_secret text)
returns setof public.mp_talent_chat_sessions
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id,
    s.session_key,
    s.talent_key,
    s.pr_key,
    coalesce(nullif(trim(t.display_name), ''), s.talent_name) as talent_name,
    coalesce(nullif(trim(p.display_name), ''), s.pr_name) as pr_name,
    coalesce(t.avatar_url, s.talent_avatar) as talent_avatar,
    s.last_text,
    s.last_ts,
    s.talent_unread,
    s.pr_unread,
    s.updated_at,
    coalesce(p.avatar_url, s.pr_avatar) as pr_avatar
  from public.mp_talent_chat_sessions s
  left join public.mp_talent_chat_participants t on t.participant_key = s.talent_key
  left join public.mp_talent_chat_participants p on p.participant_key = s.pr_key
  where public.mp_talent_chat_verify_secret(p_key, p_secret)
    and (s.talent_key = p_key or s.pr_key = p_key)
  order by s.updated_at desc
  limit 80;
$$;

drop function if exists public.mp_talent_chat_ensure_session(text, text, text, text, text, text, text);
drop function if exists public.mp_talent_chat_ensure_session(text, text, text, text, text, text, text, text);

create or replace function public.mp_talent_chat_ensure_session(
  p_talent_key text,
  p_pr_key text,
  p_talent_secret text,
  p_pr_secret text,
  p_talent_name text,
  p_pr_name text,
  p_talent_avatar text,
  p_pr_avatar text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sk text;
  v_id uuid;
begin
  if not public.mp_talent_chat_verify_secret(p_pr_key, p_pr_secret)
     and not public.mp_talent_chat_verify_secret(p_talent_key, p_talent_secret) then
    raise exception 'forbidden';
  end if;
  perform public.mp_talent_chat_upsert_participant(
    p_talent_key, 'talent', p_talent_secret,
    coalesce(nullif(trim(p_talent_name), ''), '达人'), p_talent_avatar, null
  );
  perform public.mp_talent_chat_upsert_participant(
    p_pr_key, 'pr', p_pr_secret,
    coalesce(nullif(trim(p_pr_name), ''), 'PR'), p_pr_avatar, null
  );
  v_sk := p_talent_key || '::' || p_pr_key;
  select id into v_id from public.mp_talent_chat_sessions where session_key = v_sk;
  if found then
    update public.mp_talent_chat_sessions set
      talent_name = coalesce(nullif(trim(p_talent_name), ''), talent_name),
      pr_name = coalesce(nullif(trim(p_pr_name), ''), pr_name),
      talent_avatar = coalesce(p_talent_avatar, talent_avatar),
      pr_avatar = coalesce(p_pr_avatar, pr_avatar)
    where id = v_id;
    return v_id;
  end if;
  insert into public.mp_talent_chat_sessions (
    session_key, talent_key, pr_key, talent_name, pr_name, talent_avatar, pr_avatar
  ) values (
    v_sk, p_talent_key, p_pr_key,
    coalesce(p_talent_name, ''), coalesce(p_pr_name, ''),
    p_talent_avatar, p_pr_avatar
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.mp_talent_chat_ensure_session(text, text, text, text, text, text, text, text) from public;
grant execute on function public.mp_talent_chat_ensure_session(text, text, text, text, text, text, text, text) to anon;

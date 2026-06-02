-- 达人端发起会话：仅校验达人密钥，PR 密钥从库中读取（避免客户端覆盖 PR device_secret）

drop function if exists public.mp_talent_chat_ensure_session_from_talent(text, text, text, text, text, text, text);

create or replace function public.mp_talent_chat_ensure_session_from_talent(
  p_talent_key text,
  p_talent_secret text,
  p_pr_key text,
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
  v_pr_secret text;
  v_id uuid;
  v_sk text;
begin
  if not public.mp_talent_chat_verify_secret(p_talent_key, p_talent_secret) then
    raise exception 'forbidden';
  end if;
  select device_secret into v_pr_secret
  from public.mp_talent_chat_participants
  where participant_key = p_pr_key and role = 'pr';
  if v_pr_secret is null or length(trim(v_pr_secret)) < 16 then
    raise exception 'pr_not_ready';
  end if;
  perform public.mp_talent_chat_upsert_participant(
    p_talent_key, 'talent', p_talent_secret,
    coalesce(nullif(trim(p_talent_name), ''), '达人'), p_talent_avatar, null
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

revoke all on function public.mp_talent_chat_ensure_session_from_talent(text, text, text, text, text, text, text) from public;
grant execute on function public.mp_talent_chat_ensure_session_from_talent(text, text, text, text, text, text, text) to anon;

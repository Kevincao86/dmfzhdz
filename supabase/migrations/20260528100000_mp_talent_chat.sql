-- 达人招募小程序 · PR 与达人私信（Supabase 存储 + Realtime）

create table if not exists public.mp_talent_chat_participants (
  participant_key text primary key,
  role text not null check (role in ('pr', 'talent')),
  display_name text not null default '',
  avatar_url text,
  member_snapshot jsonb,
  device_secret text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.mp_talent_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  talent_key text not null references public.mp_talent_chat_participants (participant_key) on delete cascade,
  pr_key text not null references public.mp_talent_chat_participants (participant_key) on delete cascade,
  talent_name text not null default '',
  pr_name text not null default '',
  talent_avatar text,
  last_text text not null default '',
  last_ts bigint not null default 0,
  talent_unread int not null default 0,
  pr_unread int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists mp_talent_chat_sessions_talent_idx
  on public.mp_talent_chat_sessions (talent_key, updated_at desc);

create index if not exists mp_talent_chat_sessions_pr_idx
  on public.mp_talent_chat_sessions (pr_key, updated_at desc);

create table if not exists public.mp_talent_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mp_talent_chat_sessions (id) on delete cascade,
  from_role text not null check (from_role in ('pr', 'talent')),
  sender_key text not null,
  text text not null,
  ts bigint not null,
  client_msg_id text not null,
  created_at timestamptz not null default now(),
  unique (session_id, client_msg_id)
);

create index if not exists mp_talent_chat_messages_session_ts_idx
  on public.mp_talent_chat_messages (session_id, ts);

alter table public.mp_talent_chat_participants enable row level security;
alter table public.mp_talent_chat_sessions enable row level security;
alter table public.mp_talent_chat_messages enable row level security;

-- 小程序 anon：经 SECURITY DEFINER 校验 device_secret 后读写
create or replace function public.mp_talent_chat_verify_secret(p_key text, p_secret text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.mp_talent_chat_participants p
    where p.participant_key = p_key
      and p.device_secret = p_secret
      and length(trim(p_secret)) >= 16
  );
$$;

revoke all on function public.mp_talent_chat_verify_secret(text, text) from public;
grant execute on function public.mp_talent_chat_verify_secret(text, text) to anon, authenticated;

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
end;
$$;

revoke all on function public.mp_talent_chat_upsert_participant(text, text, text, text, text, jsonb) from public;
grant execute on function public.mp_talent_chat_upsert_participant(text, text, text, text, text, jsonb) to anon;

create or replace function public.mp_talent_chat_list_sessions(p_key text, p_secret text)
returns setof public.mp_talent_chat_sessions
language sql
security definer
set search_path = public
stable
as $$
  select s.*
  from public.mp_talent_chat_sessions s
  where public.mp_talent_chat_verify_secret(p_key, p_secret)
    and (s.talent_key = p_key or s.pr_key = p_key)
  order by s.updated_at desc
  limit 80;
$$;

revoke all on function public.mp_talent_chat_list_sessions(text, text) from public;
grant execute on function public.mp_talent_chat_list_sessions(text, text) to anon;

create or replace function public.mp_talent_chat_fetch_messages(
  p_session_id uuid,
  p_key text,
  p_secret text,
  p_since_ts bigint default 0
)
returns setof public.mp_talent_chat_messages
language sql
security definer
set search_path = public
stable
as $$
  select m.*
  from public.mp_talent_chat_messages m
  join public.mp_talent_chat_sessions s on s.id = m.session_id
  where m.session_id = p_session_id
    and public.mp_talent_chat_verify_secret(p_key, p_secret)
    and (s.talent_key = p_key or s.pr_key = p_key)
    and m.ts > coalesce(p_since_ts, 0)
  order by m.ts asc
  limit 300;
$$;

revoke all on function public.mp_talent_chat_fetch_messages(uuid, text, text, bigint) from public;
grant execute on function public.mp_talent_chat_fetch_messages(uuid, text, text, bigint) to anon;

create or replace function public.mp_talent_chat_send_message(
  p_session_id uuid,
  p_key text,
  p_secret text,
  p_from_role text,
  p_text text,
  p_client_msg_id text,
  p_ts bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_session public.mp_talent_chat_sessions%rowtype;
begin
  if not public.mp_talent_chat_verify_secret(p_key, p_secret) then
    raise exception 'forbidden';
  end if;
  select * into v_session from public.mp_talent_chat_sessions where id = p_session_id;
  if not found then raise exception 'session_not_found'; end if;
  if p_from_role = 'talent' and v_session.talent_key <> p_key then raise exception 'forbidden'; end if;
  if p_from_role = 'pr' and v_session.pr_key <> p_key then raise exception 'forbidden'; end if;

  insert into public.mp_talent_chat_messages (session_id, from_role, sender_key, text, ts, client_msg_id)
  values (p_session_id, p_from_role, p_key, trim(p_text), p_ts, p_client_msg_id)
  on conflict (session_id, client_msg_id) do nothing
  returning id into v_id;

  update public.mp_talent_chat_sessions set
    last_text = left(trim(p_text), 120),
    last_ts = p_ts,
    updated_at = now(),
    talent_unread = case when p_from_role = 'pr' then talent_unread + 1 else 0 end,
    pr_unread = case when p_from_role = 'talent' then pr_unread + 1 else 0 end
  where id = p_session_id;

  return v_id;
end;
$$;

revoke all on function public.mp_talent_chat_send_message(uuid, text, text, text, text, text, bigint) from public;
grant execute on function public.mp_talent_chat_send_message(uuid, text, text, text, text, text, bigint) to anon;

create or replace function public.mp_talent_chat_ensure_session(
  p_talent_key text,
  p_pr_key text,
  p_talent_secret text,
  p_pr_secret text,
  p_talent_name text,
  p_pr_name text,
  p_talent_avatar text
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
    coalesce(nullif(trim(p_pr_name), ''), 'PR'), null, null
  );
  v_sk := p_talent_key || '::' || p_pr_key;
  select id into v_id from public.mp_talent_chat_sessions where session_key = v_sk;
  if found then
    update public.mp_talent_chat_sessions set
      talent_name = coalesce(nullif(trim(p_talent_name), ''), talent_name),
      pr_name = coalesce(nullif(trim(p_pr_name), ''), pr_name),
      talent_avatar = coalesce(p_talent_avatar, talent_avatar)
    where id = v_id;
    return v_id;
  end if;
  insert into public.mp_talent_chat_sessions (
    session_key, talent_key, pr_key, talent_name, pr_name, talent_avatar
  ) values (
    v_sk, p_talent_key, p_pr_key,
    coalesce(p_talent_name, ''), coalesce(p_pr_name, ''),
    p_talent_avatar
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.mp_talent_chat_ensure_session(text, text, text, text, text, text, text) from public;
grant execute on function public.mp_talent_chat_ensure_session(text, text, text, text, text, text, text) to anon;

create or replace function public.mp_talent_chat_mark_read(
  p_session_id uuid,
  p_key text,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mp_talent_chat_verify_secret(p_key, p_secret) then
    raise exception 'forbidden';
  end if;
  update public.mp_talent_chat_sessions set
    talent_unread = case when talent_key = p_key then 0 else talent_unread end,
    pr_unread = case when pr_key = p_key then 0 else pr_unread end
  where id = p_session_id;
end;
$$;

revoke all on function public.mp_talent_chat_mark_read(uuid, text, text) from public;
grant execute on function public.mp_talent_chat_mark_read(uuid, text, text) to anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'mp_talent_chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.mp_talent_chat_messages';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'mp_talent_chat_sessions'
  ) then
    execute 'alter publication supabase_realtime add table public.mp_talent_chat_sessions';
  end if;
end $$;

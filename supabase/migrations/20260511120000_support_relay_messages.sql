-- 在线客服：生产环境经 Supabase 存储消息；商家 ERP（已登录）写入，运营台通过 Vercel API + service_role 轮询。
-- 本地开发仍可仅用 WebSocket（vite-plugins/supportOnlineWs）；未部署本表时 ERP 会退回「仅本地」模式。

create table if not exists public.support_relay_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  customer_id text,
  enterprise_name text,
  from_role text not null
    check (from_role in ('user', 'bot', 'agent', 'system', 'ops')),
  text text not null,
  ts bigint not null,
  client_msg_id text not null,
  author_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, client_msg_id)
);

create index if not exists support_relay_messages_session_ts_idx
  on public.support_relay_messages (session_id, ts);

alter table public.support_relay_messages enable row level security;

-- 商家端：仅允许写入本人发起的会话消息（含智能助手/系统话术由同一 JWT 代发）
create policy "support_relay_messages_insert_merchant"
  on public.support_relay_messages
  for insert
  to authenticated
  with check (
    author_user_id = auth.uid()
    and from_role in ('user', 'bot', 'agent', 'system')
  );

-- 商家端：可读本会话内所有消息（含客服 ops 回复）
create policy "support_relay_messages_select_participant"
  on public.support_relay_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.support_relay_messages x
      where x.session_id = support_relay_messages.session_id
        and x.author_user_id = auth.uid()
    )
  );

grant select, insert on public.support_relay_messages to authenticated;

-- Realtime：商家端订阅本会话新消息
alter publication supabase_realtime add table public.support_relay_messages;

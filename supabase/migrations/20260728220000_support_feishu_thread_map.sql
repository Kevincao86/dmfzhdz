-- 飞书双向客服：会话 ↔ 飞书消息线程映射（坐席回复 root/parent 反查 session_id）

create table if not exists public.support_feishu_thread_map (
  session_id text primary key,
  feishu_chat_id text,
  feishu_root_msg_id text,
  feishu_open_id text,
  channel text,
  enterprise_name text,
  customer_id text,
  updated_at timestamptz not null default now()
);

create unique index if not exists support_feishu_thread_map_root_msg_uidx
  on public.support_feishu_thread_map (feishu_root_msg_id)
  where feishu_root_msg_id is not null and length(trim(feishu_root_msg_id)) > 0;

create index if not exists support_feishu_thread_map_chat_idx
  on public.support_feishu_thread_map (feishu_chat_id);

alter table public.support_feishu_thread_map enable row level security;

-- 仅 service_role / 后端写入；不开放 authenticated 直写
grant select, insert, update, delete on table public.support_feishu_thread_map to service_role;
grant select on table public.support_feishu_thread_map to authenticated;

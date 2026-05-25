-- 在线客服飞书通知去重：运营台轮询 claim 后写入，避免多 Tab 重复推送。
alter table public.support_relay_messages
  add column if not exists feishu_notified_at timestamptz;

create index if not exists support_relay_messages_feishu_pending_idx
  on public.support_relay_messages (ts)
  where feishu_notified_at is null and from_role = 'user';

-- 平台改动预警：紧急 / 普通 优先级（紧急在商户 ERP 首页弹窗）

create type public.tenant_announcement_priority as enum ('normal', 'urgent');

alter table public.tenant_announcements
  add column if not exists priority public.tenant_announcement_priority not null default 'normal';

comment on column public.tenant_announcements.priority is
  '平台改动类公告优先级：urgent 在商户 ERP 首页弹窗；subscription_expiring 固定 normal';

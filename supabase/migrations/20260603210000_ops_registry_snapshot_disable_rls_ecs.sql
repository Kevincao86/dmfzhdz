-- ECS 自建 PostgREST：policy 仍可能 42501，备案期直接关闭注册表 RLS（仅 service_role 经内网访问）
alter table public.ops_registry_snapshot disable row level security;

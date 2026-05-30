-- 自建 ECS PostgREST：service_role 需显式 GRANT 才能写入 tenants 等表
-- 在 ECS 执行：sudo -u postgres psql -p 5433 -f ~/app/supabase/ecs_service_role_grants.sql

GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- 客户端 anon / authenticated 按需只读（RLS 仍生效）
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- 在线客服 support_relay_messages：浏览器经 PostgREST 写入（RLS 约束行级权限）
GRANT SELECT, INSERT ON public.support_relay_messages TO authenticated;
GRANT INSERT ON public.support_relay_messages TO anon;
DO $$
BEGIN
  IF to_regprocedure('public.support_relay_guest_fetch_session(text,text)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.support_relay_guest_fetch_session(text, text) TO anon';
  END IF;
  IF to_regprocedure('public.support_relay_user_participates_in_session(text)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.support_relay_user_participates_in_session(text) TO authenticated';
  END IF;
END $$;

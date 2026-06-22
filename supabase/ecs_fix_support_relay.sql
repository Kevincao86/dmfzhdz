-- ECS 在线客服 repair：表权限 + RLS 策略 + RPC（迁移后 pg_restore 缺策略时可重跑）
-- 用法（ECS）：postgres 无法读 /home/admin，先复制到 /tmp 再执行：
--   sudo cp ~/app/supabase/ecs_fix_support_relay.sql /tmp/ecs_fix_support_relay.sql
--   sudo chmod 644 /tmp/ecs_fix_support_relay.sql
--   cd /tmp && sudo -u postgres psql -p 5433 -d postgres -f /tmp/ecs_fix_support_relay.sql

\echo '== support_relay_messages table =='
SELECT to_regclass('public.support_relay_messages') AS table_exists;

\echo '== re-apply grants =='
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.support_relay_messages TO authenticated;
GRANT INSERT ON public.support_relay_messages TO anon;
GRANT SELECT, INSERT, UPDATE ON public.support_relay_messages TO service_role;

\echo '== feishu notify column =='
ALTER TABLE public.support_relay_messages
  ADD COLUMN IF NOT EXISTS feishu_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS support_relay_messages_feishu_pending_idx
  ON public.support_relay_messages (feishu_notified_at)
  WHERE feishu_notified_at IS NULL AND from_role = 'user';

\echo '== guest column + anon insert policy =='
ALTER TABLE public.support_relay_messages
  ADD COLUMN IF NOT EXISTS guest_fingerprint text;

DROP POLICY IF EXISTS "support_relay_messages_insert_anon_guest" ON public.support_relay_messages;
CREATE POLICY "support_relay_messages_insert_anon_guest"
  ON public.support_relay_messages
  FOR INSERT
  TO anon
  WITH CHECK (
    author_user_id IS NULL
    AND guest_fingerprint IS NOT NULL
    AND length(trim(guest_fingerprint)) >= 16
    AND from_role IN ('user', 'bot', 'agent', 'system')
  );

DROP POLICY IF EXISTS "support_relay_messages_insert_merchant" ON public.support_relay_messages;
CREATE POLICY "support_relay_messages_insert_merchant"
  ON public.support_relay_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND from_role IN ('user', 'bot', 'agent', 'system')
  );

CREATE OR REPLACE FUNCTION public.support_relay_user_participates_in_session(p_session_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_relay_messages m
    WHERE m.session_id = p_session_id
      AND m.author_user_id IS NOT DISTINCT FROM auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.support_relay_user_participates_in_session(text) FROM public;
GRANT EXECUTE ON FUNCTION public.support_relay_user_participates_in_session(text) TO authenticated;

DROP POLICY IF EXISTS "support_relay_messages_select_participant" ON public.support_relay_messages;
CREATE POLICY "support_relay_messages_select_participant"
  ON public.support_relay_messages
  FOR SELECT
  TO authenticated
  USING (public.support_relay_user_participates_in_session(session_id));

\echo '== service_role bypass RLS (ECS auth-api relay / support-poll) =='
DROP POLICY IF EXISTS "support_relay_messages_service_role_all" ON public.support_relay_messages;
CREATE POLICY "support_relay_messages_service_role_all"
  ON public.support_relay_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.support_relay_guest_fetch_session(p_session_id text, p_guest_fingerprint text)
RETURNS SETOF public.support_relay_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT m.*
  FROM public.support_relay_messages m
  WHERE m.session_id = p_session_id
    AND length(trim(p_guest_fingerprint)) >= 16
    AND EXISTS (
      SELECT 1
      FROM public.support_relay_messages a
      WHERE a.session_id = p_session_id
        AND a.guest_fingerprint = p_guest_fingerprint
    );
$$;

REVOKE ALL ON FUNCTION public.support_relay_guest_fetch_session(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.support_relay_guest_fetch_session(text, text) TO anon;

\echo '== done =='
SELECT count(*) AS row_count FROM public.support_relay_messages;

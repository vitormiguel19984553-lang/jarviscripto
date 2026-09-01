-- ============ helpers ============
CREATE OR REPLACE FUNCTION public.has_min_staff_level(_user_id uuid, _level text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _level
    WHEN 'admin' THEN public.has_role(_user_id, 'admin')
    WHEN 'gerente' THEN public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'gerente')
    ELSE public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'gerente') OR public.has_role(_user_id, 'colaborador')
  END
$$;

-- ============ profiles ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS full_legal_name text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'nao_iniciado',
  ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS risk_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid,
  ADD COLUMN IF NOT EXISTS explain_simple boolean NOT NULL DEFAULT false;

UPDATE public.profiles SET referral_code = upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles(referral_code);

DROP POLICY IF EXISTS "Staff can read all profiles" ON public.profiles;
CREATE POLICY "Staff can read all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_min_staff_level(auth.uid(), 'colaborador'));

-- ============ storage: avatars ============
DROP POLICY IF EXISTS "Users read own avatar" ON storage.objects;
CREATE POLICY "Users read own avatar" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============ phone verification (server only) ============
CREATE TABLE IF NOT EXISTS public.phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  code text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.phone_verifications TO service_role;
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No client access to phone verifications" ON public.phone_verifications
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ============ exchange connections ============
CREATE TABLE IF NOT EXISTS public.exchange_connections (
  user_id uuid PRIMARY KEY,
  exchange text NOT NULL DEFAULT 'binance',
  key_masked text NOT NULL,
  verified_at timestamptz,
  last_balance numeric,
  last_verify_error text,
  real_trading_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.exchange_connections TO authenticated;
GRANT ALL ON public.exchange_connections TO service_role;
ALTER TABLE public.exchange_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own exchange connection" ON public.exchange_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own exchange connection" ON public.exchange_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_exchange_connections_updated_at BEFORE UPDATE ON public.exchange_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.exchange_secrets (
  user_id uuid PRIMARY KEY,
  api_key_cipher text NOT NULL,
  api_secret_cipher text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.exchange_secrets TO service_role;
ALTER TABLE public.exchange_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No client access to exchange secrets" ON public.exchange_secrets
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ============ admin: audit, credits, restrictions ============
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_name text,
  target_user_id uuid,
  action text NOT NULL,
  reason text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read audit log" ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.has_min_staff_level(auth.uid(), 'colaborador'));
CREATE POLICY "Managers write audit log" ON public.admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_min_staff_level(auth.uid(), 'gerente') AND actor_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  reason text NOT NULL,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.credit_grants TO authenticated;
GRANT ALL ON public.credit_grants TO service_role;
ALTER TABLE public.credit_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own credit grants" ON public.credit_grants FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_min_staff_level(auth.uid(), 'colaborador'));
CREATE POLICY "Managers grant credits" ON public.credit_grants FOR INSERT TO authenticated
  WITH CHECK (public.has_min_staff_level(auth.uid(), 'gerente') AND granted_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  reason text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  lifted_by uuid,
  lifted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_restrictions TO authenticated;
GRANT ALL ON public.user_restrictions TO service_role;
ALTER TABLE public.user_restrictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own restrictions" ON public.user_restrictions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_min_staff_level(auth.uid(), 'colaborador'));
CREATE POLICY "Managers create restrictions" ON public.user_restrictions FOR INSERT TO authenticated
  WITH CHECK (public.has_min_staff_level(auth.uid(), 'gerente') AND created_by = auth.uid());
CREATE POLICY "Managers update restrictions" ON public.user_restrictions FOR UPDATE TO authenticated
  USING (public.has_min_staff_level(auth.uid(), 'gerente'))
  WITH CHECK (public.has_min_staff_level(auth.uid(), 'gerente'));
CREATE TRIGGER update_user_restrictions_updated_at BEFORE UPDATE ON public.user_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- ============ bot settings ============
ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS max_trades_per_hour integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS diversification_cap_pct numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS use_sentiment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sandbox_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS real_mode boolean NOT NULL DEFAULT false;

-- ============ sandbox portfolio ============
CREATE TABLE IF NOT EXISTS public.sandbox_portfolios (
  user_id uuid PRIMARY KEY,
  available numeric NOT NULL DEFAULT 10000,
  invested numeric NOT NULL DEFAULT 0,
  trades integer NOT NULL DEFAULT 0,
  total_pnl numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sandbox_portfolios TO authenticated;
GRANT ALL ON public.sandbox_portfolios TO service_role;
ALTER TABLE public.sandbox_portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sandbox" ON public.sandbox_portfolios FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ referrals ============
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL UNIQUE,
  reward_days integer NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own referrals" ON public.referrals FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id
    OR public.has_min_staff_level(auth.uid(), 'colaborador'));
CREATE POLICY "Users register own referral" ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = referred_id);

-- ============ feedback board ============
CREATE TABLE IF NOT EXISTS public.feedback_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'aberto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_posts TO authenticated;
GRANT ALL ON public.feedback_posts TO service_role;
ALTER TABLE public.feedback_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read feedback" ON public.feedback_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create feedback" ON public.feedback_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users edit own feedback" ON public.feedback_posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_min_staff_level(auth.uid(), 'gerente'))
  WITH CHECK (auth.uid() = user_id OR public.has_min_staff_level(auth.uid(), 'gerente'));
CREATE POLICY "Users delete own feedback" ON public.feedback_posts FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_min_staff_level(auth.uid(), 'gerente'));
CREATE TRIGGER update_feedback_posts_updated_at BEFORE UPDATE ON public.feedback_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.feedback_votes (
  post_id uuid NOT NULL REFERENCES public.feedback_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.feedback_votes TO authenticated;
GRANT ALL ON public.feedback_votes TO service_role;
ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read votes" ON public.feedback_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users vote once" ON public.feedback_votes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove own vote" ON public.feedback_votes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============ strategy variants ============
CREATE TABLE IF NOT EXISTS public.strategy_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  base_strategy text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseline_score numeric NOT NULL DEFAULT 0,
  variant_score numeric NOT NULL DEFAULT 0,
  promoted boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_variants TO authenticated;
GRANT ALL ON public.strategy_variants TO service_role;
ALTER TABLE public.strategy_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own strategy variants" ON public.strategy_variants FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ daily summaries ============
CREATE TABLE IF NOT EXISTS public.daily_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day)
);
GRANT SELECT, INSERT, UPDATE ON public.daily_summaries TO authenticated;
GRANT ALL ON public.daily_summaries TO service_role;
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own summaries" ON public.daily_summaries FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ linter cleanups ============
DROP POLICY IF EXISTS "No client access to bot cron config" ON public.bot_cron_config;
CREATE POLICY "No client access to bot cron config" ON public.bot_cron_config
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
REVOKE EXECUTE ON FUNCTION public.run_bot_tick() FROM authenticated, anon;
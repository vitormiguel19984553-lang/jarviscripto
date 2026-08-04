ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS take_profit_pct numeric NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS stop_loss_pct numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS trailing_stop_pct numeric NOT NULL DEFAULT 1.0;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS emergency_stop boolean NOT NULL DEFAULT false;
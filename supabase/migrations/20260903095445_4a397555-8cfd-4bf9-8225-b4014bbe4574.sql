ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS trade_direction text NOT NULL DEFAULT 'ambos',
  ADD COLUMN IF NOT EXISTS fast_exit boolean NOT NULL DEFAULT true;

ALTER TABLE public.bot_settings
  DROP CONSTRAINT IF EXISTS bot_settings_trade_direction_check;

ALTER TABLE public.bot_settings
  ADD CONSTRAINT bot_settings_trade_direction_check
  CHECK (trade_direction IN ('compra', 'venda', 'ambos'));
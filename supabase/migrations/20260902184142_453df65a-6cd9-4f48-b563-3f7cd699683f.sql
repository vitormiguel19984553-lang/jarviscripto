alter table public.bot_settings
  add column if not exists real_trade_amount numeric not null default 10,
  add column if not exists real_max_loss_trade numeric not null default 5,
  add column if not exists real_max_loss_day numeric not null default 20;
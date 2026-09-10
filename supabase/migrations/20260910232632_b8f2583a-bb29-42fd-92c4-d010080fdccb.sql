ALTER TABLE public.strategy_state
  ADD COLUMN IF NOT EXISTS symbol text NOT NULL DEFAULT '*';

ALTER TABLE public.strategy_state DROP CONSTRAINT IF EXISTS strategy_state_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS strategy_state_user_symbol_key
  ON public.strategy_state (user_id, symbol);

WITH base AS (
  SELECT t.user_id,
         count(*) FILTER (WHERE t.pnl <> 0) AS trades,
         count(*) FILTER (WHERE t.pnl > 0) AS wins,
         count(*) FILTER (WHERE t.pnl < 0) AS losses,
         round(coalesce(sum(t.pnl), 0), 2) AS total_pnl
  FROM public.trades t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE t.created_at >= coalesce(p.reset_point_at, '-infinity'::timestamptz)
  GROUP BY t.user_id
)
UPDATE public.strategy_state s
SET trades = coalesce(b.trades, 0),
    wins = coalesce(b.wins, 0),
    losses = coalesce(b.losses, 0),
    total_pnl = coalesce(b.total_pnl, 0),
    sharpe = 0,
    min_confidence = 55,
    last_adjust_at = NULL,
    updated_at = now()
FROM (SELECT * FROM base) b
WHERE s.user_id = b.user_id AND s.symbol = '*';

UPDATE public.strategy_state
SET trades = 0, wins = 0, losses = 0, total_pnl = 0, sharpe = 0,
    min_confidence = 55, last_adjust_at = NULL, updated_at = now()
WHERE symbol = '*'
  AND user_id NOT IN (
    SELECT t.user_id FROM public.trades t
    JOIN public.profiles p ON p.id = t.user_id
    WHERE t.created_at >= coalesce(p.reset_point_at, '-infinity'::timestamptz)
    GROUP BY t.user_id
  );

INSERT INTO public.strategy_state (user_id, symbol, min_confidence, trades, wins, losses, total_pnl, sharpe)
SELECT t.user_id,
       upper(t.symbol),
       55,
       count(*) FILTER (WHERE t.pnl <> 0),
       count(*) FILTER (WHERE t.pnl > 0),
       count(*) FILTER (WHERE t.pnl < 0),
       round(coalesce(sum(t.pnl), 0), 2),
       0
FROM public.trades t
JOIN public.profiles p ON p.id = t.user_id
WHERE t.created_at >= coalesce(p.reset_point_at, '-infinity'::timestamptz)
GROUP BY t.user_id, upper(t.symbol)
ON CONFLICT (user_id, symbol) DO UPDATE
SET trades = EXCLUDED.trades,
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    total_pnl = EXCLUDED.total_pnl,
    sharpe = 0,
    min_confidence = 55,
    last_adjust_at = NULL,
    updated_at = now();

UPDATE public.strategy_symbol_stats ss
SET trades = coalesce(b.trades, 0),
    wins = coalesce(b.wins, 0),
    total_pnl = coalesce(b.total_pnl, 0),
    weight = 1,
    updated_at = now()
FROM (
  SELECT t.user_id, upper(t.symbol) AS symbol,
         count(*) FILTER (WHERE t.pnl <> 0) AS trades,
         count(*) FILTER (WHERE t.pnl > 0) AS wins,
         round(coalesce(sum(t.pnl), 0), 2) AS total_pnl
  FROM public.trades t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE t.created_at >= coalesce(p.reset_point_at, '-infinity'::timestamptz)
  GROUP BY t.user_id, upper(t.symbol)
) b
WHERE ss.user_id = b.user_id AND ss.symbol = b.symbol;

UPDATE public.strategy_symbol_stats
SET trades = 0, wins = 0, total_pnl = 0, weight = 1, updated_at = now()
WHERE (user_id, symbol) NOT IN (
  SELECT t.user_id, upper(t.symbol)
  FROM public.trades t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE t.created_at >= coalesce(p.reset_point_at, '-infinity'::timestamptz)
  GROUP BY t.user_id, upper(t.symbol)
);

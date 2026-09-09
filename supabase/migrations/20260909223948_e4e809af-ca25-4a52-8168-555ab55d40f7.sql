ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reset_point_at timestamptz;
UPDATE public.profiles SET reset_point_at = '2026-09-09T00:00:00Z' WHERE reset_point_at IS NULL;
UPDATE public.sim_positions
SET avg_entry_price = ROUND(avg_entry_price * 0.81942, 10),
    invested = ROUND(quantity * avg_entry_price * 0.81942, 2),
    peak_price = ROUND(avg_entry_price * 0.81942, 10),
    opened_at = now(),
    updated_at = now()
WHERE quantity > 0;
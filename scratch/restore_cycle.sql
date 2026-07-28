-- 1. Restore allocated_budget for the previous cycle
UPDATE pockets p
SET allocated_budget = (
  SELECT COALESCE(SUM(CAST(metadata->'distribution'->>p.id::text AS numeric)), 0)
  FROM transactions
  WHERE cycle_id = '02f2274f-3af6-4e98-b1dd-a56b1db83c67' AND category = 'Ingreso'
);

-- 2. Delete the monthly closure
DELETE FROM monthly_closures WHERE year = 2026 AND month = 7 AND user_id = (SELECT user_id FROM user_budget_cycles WHERE id = '02f2274f-3af6-4e98-b1dd-a56b1db83c67');

-- 3. Delete the new empty cycle
DELETE FROM user_budget_cycles WHERE id = '6e3258b2-3083-44fe-8c28-189798244366';

-- 4. Reopen the old cycle
UPDATE user_budget_cycles SET end_date = NULL, user_closed = false WHERE id = '02f2274f-3af6-4e98-b1dd-a56b1db83c67';

-- =====================================================================
-- 20260418000006_retention_and_cron.sql
-- Storage hygiene + scheduled jobs.
-- We keep raw events for 180 days (enough to spot quarterly patterns),
-- compacted summaries forever in user_memory, and chat messages for 1y.
-- Requires the pg_cron and pg_net extensions. Both are available on
-- Supabase but must be enabled explicitly.
-- =====================================================================

-- Extensions are enabled in the `extensions` schema on Supabase.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- -----------------------------
-- Retention job: prune raw user_events older than 180 days.
-- -----------------------------
create or replace function public.cron_prune_user_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_events
  where occurred_at < now() - interval '180 days';
end
$$;

-- Retention job: expire old insights.
create or replace function public.cron_expire_user_insights()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_insights
  set status = 'expired'
  where status = 'active'
    and expires_at is not null
    and expires_at < now();
end
$$;

-- Schedule both jobs. pg_cron uses a single job registry; we upsert
-- by name so re-running the migration is idempotent.
do $$
begin
  -- Drop old invocations if they exist.
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('prune_user_events_daily', 'expire_user_insights_hourly');
exception when others then
  -- pg_cron not yet available in this environment; ignore.
  null;
end
$$;

select cron.schedule(
  'prune_user_events_daily',
  '15 3 * * *',                                  -- 03:15 UTC every day
  $$ select public.cron_prune_user_events(); $$
);

select cron.schedule(
  'expire_user_insights_hourly',
  '7 * * * *',                                   -- :07 every hour
  $$ select public.cron_expire_user_insights(); $$
);

comment on function public.cron_prune_user_events() is
  'Removes raw behavioural events older than 180 days. Long-term signal lives in user_memory and user_insights.';

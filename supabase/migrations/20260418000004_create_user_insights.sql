-- =====================================================================
-- 20260418000004_create_user_insights.sql
-- AI-generated, time-boxed observations the user can act on.
-- "You spent 38% more on delivery this week" or
-- "Your 'Comida' pocket is 80% consumed on day 9/30".
-- Rendered as cards in the home feed.
-- =====================================================================

create table if not exists public.user_insights (
  id             bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  insight_type   text not null,              -- 'pocket_burn', 'recurring_spike', 'new_merchant', 'savings_opportunity', ...
  severity       text not null default 'info' check (severity in ('info', 'notice', 'warning', 'critical')),
  title          text not null,
  body           text not null,              -- prose, safe to render in UI
  data           jsonb not null default '{}'::jsonb,
  -- A suggested next action (deep link + tool call payload) the UI can run.
  suggested_action jsonb,
  status         text not null default 'active' check (status in ('active', 'dismissed', 'acted_on', 'expired')),
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  -- Useful for deduping: don't emit the same insight twice in a row.
  dedupe_key     text
);

create index if not exists user_insights_user_status_idx
  on public.user_insights (user_id, status, created_at desc);

create index if not exists user_insights_dedupe_idx
  on public.user_insights (user_id, dedupe_key)
  where dedupe_key is not null;

-- -----------------------------
-- RLS
-- -----------------------------
alter table public.user_insights enable row level security;

drop policy if exists "user_insights_select_own" on public.user_insights;
create policy "user_insights_select_own"
  on public.user_insights for select
  using (auth.uid() = user_id);

-- The client may dismiss or mark as acted_on, but cannot create insights
-- or change their content.
drop policy if exists "user_insights_update_status_own" on public.user_insights;
create policy "user_insights_update_status_own"
  on public.user_insights for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and status in ('dismissed', 'acted_on')
  );

comment on table public.user_insights is
  'AI-generated actionable insights surfaced in the feed. Created by cron jobs and Edge Functions; status toggled by the client.';

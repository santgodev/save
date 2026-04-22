-- =====================================================================
-- 20260418000002_create_user_events.sql
-- Append-only event store. This is the substrate the AI learns from.
-- Every meaningful user action (transaction created, pocket edited,
-- receipt scanned, advice accepted...) is recorded here with a jsonb
-- payload so we can query patterns without schema churn.
-- =====================================================================

create table if not exists public.user_events (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  event_type   text not null,                 -- e.g. 'transaction.created', 'scanner.scanned', 'advice.accepted'
  occurred_at  timestamptz not null default now(),
  session_id   text,                          -- client session id (optional)
  payload      jsonb not null default '{}'::jsonb,
  app_version  text,
  platform     text,                          -- 'ios' | 'android' | 'web'
  source       text not null default 'client' -- 'client' | 'trigger' | 'cron' | 'edge_fn'
);

-- Hot path: "give me everything for user X in the last 30 days".
create index if not exists user_events_user_time_idx
  on public.user_events (user_id, occurred_at desc);

-- Pattern detection: "how many times did user X do event Y last week?"
create index if not exists user_events_user_type_time_idx
  on public.user_events (user_id, event_type, occurred_at desc);

-- JSON payload lookups (merchant, pocket_id, amount bucket, etc.)
create index if not exists user_events_payload_gin_idx
  on public.user_events using gin (payload jsonb_path_ops);

-- -----------------------------
-- RLS
-- -----------------------------
alter table public.user_events enable row level security;

drop policy if exists "user_events_select_own" on public.user_events;
create policy "user_events_select_own"
  on public.user_events for select
  using (auth.uid() = user_id);

drop policy if exists "user_events_insert_own" on public.user_events;
create policy "user_events_insert_own"
  on public.user_events for insert
  with check (auth.uid() = user_id);

-- Events are append-only from the client: no update, no delete.
-- Retention is handled by a scheduled job (see 20260418000006).

comment on table public.user_events is
  'Append-only behavioural event log. Feeds pattern detection, insights, and the AI advisors context-building layer.';

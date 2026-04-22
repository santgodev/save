-- =====================================================================
-- 20260418000003_create_user_memory.sql
-- Long-term, curated memory the AI can rely on without rescanning the
-- whole event store every turn. Think of this as the advisor's notebook.
-- It is written by the weekly-synth Edge Function (and occasionally by
-- the advisor itself via a tool call) and read at the start of every chat.
-- =====================================================================

create table if not exists public.user_memory (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Coarse grouping so we can load a slice selectively.
  -- e.g. 'habit', 'goal', 'preference', 'constraint', 'profile'.
  kind        text not null,
  -- Machine-stable key, e.g. 'habit.coffee.daily' or 'goal.vacation_jul'.
  key         text not null,
  -- Short natural-language summary suitable to inline into the prompt.
  summary     text not null,
  -- Structured form for rules and tools (amount thresholds, pocket ids...).
  data        jsonb not null default '{}'::jsonb,
  -- How trustworthy the memory is (0..1). Weekly synth increases it when
  -- signals keep confirming; stale entries get decayed.
  confidence  real not null default 0.5 check (confidence between 0 and 1),
  last_seen_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists user_memory_user_kind_idx
  on public.user_memory (user_id, kind);

create index if not exists user_memory_user_confidence_idx
  on public.user_memory (user_id, confidence desc);

-- Keep updated_at honest.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists user_memory_set_updated_at on public.user_memory;
create trigger user_memory_set_updated_at
  before update on public.user_memory
  for each row execute function public.set_updated_at();

-- -----------------------------
-- RLS
-- -----------------------------
alter table public.user_memory enable row level security;

drop policy if exists "user_memory_select_own" on public.user_memory;
create policy "user_memory_select_own"
  on public.user_memory for select
  using (auth.uid() = user_id);

-- Clients do not write memory directly; only the Edge Functions
-- (service role) and the weekly synthesiser do. Hence no insert/update
-- policy for authenticated users.

comment on table public.user_memory is
  'Curated long-term facts about the user. Written by the AI synthesis job. Read by every advisor turn.';

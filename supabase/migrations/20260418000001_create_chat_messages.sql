-- =====================================================================
-- 20260418000001_create_chat_messages.sql
-- Phase 1 foundation: persist the AI advisor chat per user.
-- Rationale: today messages live only in React state inside TopBar.tsx
-- and are lost on reload. We need durable history to (a) show context,
-- (b) feed it back to the LLM, (c) analyse conversations later.
-- =====================================================================

create table if not exists public.chat_messages (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  session_id    text,                         -- optional: group related turns
  role          text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content       text not null,
  -- When the LLM calls a tool (transfer_between_pockets, create_pocket, ...)
  -- we persist the structured call + its result for auditability.
  tool_name     text,
  tool_input    jsonb,
  tool_output   jsonb,
  -- Token accounting to watch costs.
  prompt_tokens      integer,
  completion_tokens  integer,
  model         text,
  -- Which prompt version generated this turn. Lets us A/B prompts safely.
  prompt_version text,
  created_at    timestamptz not null default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);

create index if not exists chat_messages_session_idx
  on public.chat_messages (user_id, session_id, created_at)
  where session_id is not null;

-- -----------------------------
-- RLS
-- -----------------------------
alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own"
  on public.chat_messages for select
  using (auth.uid() = user_id);

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own"
  on public.chat_messages for insert
  with check (auth.uid() = user_id);

-- No update/delete from client. The Edge Function uses the service role
-- key to write assistant/tool turns, and we never expose the service key
-- to the app, so the user cannot impersonate the assistant.

comment on table public.chat_messages is
  'Full turn-by-turn history of the AI financial advisor. Written by the chat-advisor Edge Function and by the client for user turns.';

-- =====================================================================
-- 20260418000005_event_triggers.sql
-- Automatic event emission from existing domain tables.
-- We keep the client dumb: it just writes to `transactions`, `pockets`,
-- `user_spending_rules` as today. These triggers fan out corresponding
-- events into `user_events` so the AI pipeline never misses anything.
-- =====================================================================

-- Generic helper: emit an event with user_id, type, payload.
create or replace function public.emit_user_event(
  p_user_id    uuid,
  p_event_type text,
  p_payload    jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.user_events (user_id, event_type, payload, source)
  values (p_user_id, p_event_type, coalesce(p_payload, '{}'::jsonb), 'trigger');
end
$$;

-- =====================================================================
-- transactions: emit created / updated / deleted
-- =====================================================================

create or replace function public.tg_transactions_emit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_payload    jsonb;
  v_user_id    uuid;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'transaction.created';
    v_user_id := new.user_id;
    v_payload := jsonb_build_object(
      'transaction_id', new.id,
      'amount',         new.amount,
      'merchant',       new.merchant,
      'pocket_id',      new.pocket_id,
      'type',           case when new.amount is not null and new.amount < 0 then 'expense' else 'income' end
    );
  elsif tg_op = 'UPDATE' then
    v_event_type := 'transaction.updated';
    v_user_id := new.user_id;
    v_payload := jsonb_build_object(
      'transaction_id', new.id,
      'before', to_jsonb(old) - 'user_id',
      'after',  to_jsonb(new) - 'user_id'
    );
  elsif tg_op = 'DELETE' then
    v_event_type := 'transaction.deleted';
    v_user_id := old.user_id;
    v_payload := jsonb_build_object(
      'transaction_id', old.id,
      'amount',         old.amount,
      'merchant',       old.merchant,
      'pocket_id',      old.pocket_id
    );
  end if;

  perform public.emit_user_event(v_user_id, v_event_type, v_payload);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

-- Attach only if the table exists (safe re-runs during development).
do $$
begin
  if to_regclass('public.transactions') is not null then
    drop trigger if exists transactions_emit_event on public.transactions;
    create trigger transactions_emit_event
      after insert or update or delete on public.transactions
      for each row execute function public.tg_transactions_emit_event();
  end if;
end
$$;

-- =====================================================================
-- pockets: emit created / updated / deleted
-- =====================================================================

create or replace function public.tg_pockets_emit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_payload    jsonb;
  v_user_id    uuid;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'pocket.created';
    v_user_id := new.user_id;
    v_payload := jsonb_build_object(
      'pocket_id', new.id,
      'name',      new.name,
      'amount',    new.amount
    );
  elsif tg_op = 'UPDATE' then
    v_event_type := 'pocket.updated';
    v_user_id := new.user_id;
    v_payload := jsonb_build_object(
      'pocket_id', new.id,
      'before', to_jsonb(old) - 'user_id',
      'after',  to_jsonb(new) - 'user_id'
    );
  elsif tg_op = 'DELETE' then
    v_event_type := 'pocket.deleted';
    v_user_id := old.user_id;
    v_payload := jsonb_build_object(
      'pocket_id', old.id,
      'name',      old.name
    );
  end if;

  perform public.emit_user_event(v_user_id, v_event_type, v_payload);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

do $$
begin
  if to_regclass('public.pockets') is not null then
    drop trigger if exists pockets_emit_event on public.pockets;
    create trigger pockets_emit_event
      after insert or update or delete on public.pockets
      for each row execute function public.tg_pockets_emit_event();
  end if;
end
$$;

-- =====================================================================
-- user_monthly_income: emit income updates (rare but important signal)
-- =====================================================================

create or replace function public.tg_income_emit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_user_id    uuid;
  v_payload    jsonb;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'income.set';
    v_user_id := new.user_id;
    v_payload := jsonb_build_object('amount', new.amount);
  elsif tg_op = 'UPDATE' then
    v_event_type := 'income.updated';
    v_user_id := new.user_id;
    v_payload := jsonb_build_object(
      'before', to_jsonb(old) - 'user_id',
      'after',  to_jsonb(new) - 'user_id'
    );
  else
    v_event_type := 'income.deleted';
    v_user_id := old.user_id;
    v_payload := jsonb_build_object('before', to_jsonb(old) - 'user_id');
  end if;

  perform public.emit_user_event(v_user_id, v_event_type, v_payload);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

do $$
begin
  if to_regclass('public.user_monthly_income') is not null then
    drop trigger if exists user_monthly_income_emit_event on public.user_monthly_income;
    create trigger user_monthly_income_emit_event
      after insert or update or delete on public.user_monthly_income
      for each row execute function public.tg_income_emit_event();
  end if;
end
$$;

comment on function public.emit_user_event(uuid, text, jsonb) is
  'Internal helper used by domain triggers to append to user_events.';

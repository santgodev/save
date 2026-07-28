# Schema snapshot — capturado 2026-07-26

Pegado directo por el usuario desde Supabase. Es una **foto congelada**,
no la fuente de verdad — si el schema real cambió desde entonces (nuevas
columnas, constraints editados), este archivo va a estar desactualizado.
Si tienes forma de consultar el schema real en la sesión (Supabase MCP,
o el usuario te lo vuelve a pegar), prefiere siempre eso. Úsalo para
detectar mismatches obvios de nombre de columna rápido, no como verdad
absoluta.

```sql
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text,
  avatar_url text,
  preferred_currency text DEFAULT 'COP'::text CHECK (preferred_currency IS NULL OR (preferred_currency = ANY (ARRAY['COP'::text, 'USD'::text, 'EUR'::text]))),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  theme_preference text DEFAULT 'sage'::text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  merchant text NOT NULL,
  amount numeric NOT NULL,
  date_string text NOT NULL CHECK (date_string ~ '^\d{4}-\d{2}-\d{2}$'::text),
  category text NOT NULL,
  icon text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  canonical_merchant text,
  cycle_id uuid,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT transactions_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.user_budget_cycles(id)
);

CREATE TABLE public.pockets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  budget numeric DEFAULT 0,
  icon text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  allocated_budget numeric NOT NULL DEFAULT 0 CHECK (allocated_budget >= 0::numeric),
  is_default_free boolean DEFAULT false,
  CONSTRAINT pockets_pkey PRIMARY KEY (id),
  CONSTRAINT pockets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.user_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  event_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  session_id text,
  app_version text,
  platform text,
  source text NOT NULL DEFAULT 'client'::text,
  CONSTRAINT user_events_pkey PRIMARY KEY (id),
  CONSTRAINT user_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.user_spending_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pattern text NOT NULL,
  canonical_pattern text,
  display_name text,
  type text NOT NULL CHECK (type = ANY (ARRAY['confidence'::text, 'monitor'::text, 'reduce'::text])),
  usage_count integer DEFAULT 0,
  last_used_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_spending_rules_pkey PRIMARY KEY (id),
  CONSTRAINT user_spending_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.chat_messages (
  id bigint NOT NULL DEFAULT nextval('chat_messages_id_seq'::regclass),
  user_id uuid NOT NULL,
  session_id text NOT NULL DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'tool'::text])),
  content text NOT NULL,
  tool_name text,
  tool_input jsonb,
  tool_output jsonb,
  prompt_tokens integer,
  completion_tokens integer,
  model text,
  prompt_version text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.user_memory (
  id bigint NOT NULL DEFAULT nextval('user_memory_id_seq'::regclass),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  key text NOT NULL,
  summary text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence real NOT NULL DEFAULT 0.5 CHECK (confidence >= 0::double precision AND confidence <= 1::double precision),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_memory_pkey PRIMARY KEY (id),
  CONSTRAINT user_memory_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.user_insights (
  id bigint NOT NULL DEFAULT nextval('user_insights_id_seq'::regclass),
  user_id uuid NOT NULL,
  insight_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info'::text CHECK (severity = ANY (ARRAY['info'::text, 'notice'::text, 'warning'::text, 'critical'::text])),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_action jsonb,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'dismissed'::text, 'acted_on'::text, 'expired'::text])),
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  dedupe_key text,
  CONSTRAINT user_insights_pkey PRIMARY KEY (id),
  CONSTRAINT user_insights_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.income_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  frequency text NOT NULL CHECK (frequency = ANY (ARRAY['monthly'::text, 'bi_weekly'::text, 'weekly'::text, 'one_time'::text])),
  next_date date,
  distribution_rules jsonb DEFAULT '{}'::jsonb CHECK (is_valid_distribution(distribution_rules)),
  is_active boolean DEFAULT true,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT income_sources_pkey PRIMARY KEY (id),
  CONSTRAINT income_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.pending_income_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_id uuid NOT NULL,
  expected_amount numeric NOT NULL,
  expected_date date NOT NULL,
  distribution_snapshot jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'dismissed'::text])),
  transaction_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pending_income_events_pkey PRIMARY KEY (id),
  CONSTRAINT pending_income_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT pending_income_events_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.income_sources(id),
  CONSTRAINT pending_income_events_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id)
);
-- NOTA (2026-07-26): esta tabla y sus RPCs (confirm_pending_income,
-- dismiss_pending_income) se quedan en la DB pero el frontend ya no las usa
-- para nada — se decidió mantener el registro de ingresos 100% manual en
-- vez de predicción automática. No reportes "nadie escribe esta tabla" como
-- hallazgo nuevo: es una decisión de producto ya tomada, no un bug.

CREATE TABLE public.income_event_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  action text NOT NULL,
  amount numeric,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT income_event_logs_pkey PRIMARY KEY (id),
  CONSTRAINT income_event_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.pending_income_events(id)
);

CREATE TABLE public.monthly_closures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL,
  closed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT monthly_closures_pkey PRIMARY KEY (id),
  CONSTRAINT monthly_closures_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.user_budget_cycles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  start_date timestamp with time zone NOT NULL DEFAULT now(),
  end_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  user_closed boolean DEFAULT false,
  CONSTRAINT user_budget_cycles_pkey PRIMARY KEY (id),
  CONSTRAINT user_budget_cycles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
```

## RPCs conocidas (de `docs/ARCHITECTURE_REVIEW.md`, verificar que sigan vigentes)

Lectura: `get_cycle_state(uuid)`, `get_history_cycles(uuid)`,
`canonicalize_merchant(text)`.

Mutación (deberían validar `auth.uid() = p_user_id` internamente):
`register_expense`, `register_income`, `execute_cycle_closure`,
`close_and_start_new_cycle`, `transfer_between_pockets`,
`delete_transaction_with_reversal`, `update_income_with_reversal`.

Operacionales/cron: `cron_expire_user_insights()`, `cron_prune_user_events()`.

`confirm_pending_income` / `dismiss_pending_income` existen en la DB pero
ya no las llama el frontend (ver nota arriba).

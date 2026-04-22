-- tests/01_smoke.sql
-- Arranca la suite verificando que el schema está bien plantado.

\echo '=== 01_smoke ==='

-- Tablas clave existen
select 'profiles'      as obj, count(*) > 0 as ok from information_schema.tables
  where table_schema='public' and table_name='profiles'
union all
select 'pockets',      count(*) > 0 from information_schema.tables
  where table_schema='public' and table_name='pockets'
union all
select 'transactions', count(*) > 0 from information_schema.tables
  where table_schema='public' and table_name='transactions'
union all
select 'user_events',  count(*) > 0 from information_schema.tables
  where table_schema='public' and table_name='user_events'
union all
select 'chat_messages',count(*) > 0 from information_schema.tables
  where table_schema='public' and table_name='chat_messages';

-- RPCs clave existen con la firma esperada
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('transfer_between_pockets','register_expense')
order by 1;

-- RLS está habilitado en las tablas sensibles
select c.relname, c.relrowsecurity as rls_on
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public'
  and c.relname in ('profiles','pockets','transactions','user_events','chat_messages')
order by 1;

\echo '=== 01_smoke OK ==='

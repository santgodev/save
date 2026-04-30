-- 20260429000001_schedule_cron_jobs.sql
--
-- Programa los 2 jobs de la Fase B:
--   - insights-daily   → 08:00 todos los días: insight-generator (reglas)
--   - memory-weekly    → 06:00 lunes:          synthesize-memory (LLM)
--
-- Cada job hace POST al Edge Function correspondiente con el header
-- Authorization: Bearer <SERVICE_ROLE_KEY>. La función detecta esto y
-- entra en "modo cron" (itera todos los profiles).
--
-- REQUISITO MANUAL (1 sola vez):
--   El SERVICE_ROLE_KEY debe estar guardado en Supabase Vault como
--   secret con nombre 'service_role_key'. Si no está, los jobs corren
--   pero las llamadas HTTP fallan con 401.
--
--   Para crearlo:
--     1. Ir a Supabase Dashboard → Project Settings → API
--     2. Copiar el valor de "service_role" key (el "secret" largo).
--     3. En SQL Editor de Supabase, ejecutar UNA VEZ:
--          SELECT vault.create_secret('<el-key-aqui>', 'service_role_key');
--
-- Para ver el estado de los jobs:
--   SELECT jobid, jobname, schedule, command FROM cron.job;
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Limpiar jobs previos con el mismo nombre (idempotente).
SELECT cron.unschedule('insights-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'insights-daily'
);
SELECT cron.unschedule('memory-weekly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'memory-weekly'
);

-- Job 1: insights-daily — 08:00 todos los días.
-- Notas:
--   - Cron en UTC (Supabase). 08:00 UTC = 03:00 Bogotá. Si querés que
--     dispare a las 08:00 Bogotá, usá '0 13 * * *'.
SELECT cron.schedule(
  'insights-daily',
  '0 13 * * *',  -- 13:00 UTC = 08:00 Bogotá
  $$
  SELECT net.http_post(
    url := 'https://vxdnudkaelhqntrrwdwa.supabase.co/functions/v1/insight-generator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Job 2: memory-weekly — lunes 06:00 Bogotá.
SELECT cron.schedule(
  'memory-weekly',
  '0 11 * * 1',  -- 11:00 UTC lunes = 06:00 Bogotá
  $$
  SELECT net.http_post(
    url := 'https://vxdnudkaelhqntrrwdwa.supabase.co/functions/v1/synthesize-memory',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000  -- el LLM puede tardar más
  );
  $$
);

-- Documentar.
COMMENT ON EXTENSION pg_cron IS
  'Cron scheduler. Jobs activos: insights-daily, memory-weekly. Definidos en migración 20260429000001_schedule_cron_jobs.';

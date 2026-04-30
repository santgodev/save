-- Add unique constraint to user_insights for deduplication
ALTER TABLE public.user_insights 
ADD CONSTRAINT user_insights_user_id_dedupe_key_key UNIQUE (user_id, dedupe_key);

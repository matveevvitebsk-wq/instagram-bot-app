-- Remove legacy payload.trigger_keyword. Keep only trigger_keywords[].
-- One value → ["слово"]. Several values → ["слово1", "слово2"].

-- Copy trigger_keyword into trigger_keywords when the array is missing/empty.
UPDATE public.automation_tasks
SET payload = jsonb_set(
    COALESCE(payload, '{}'::jsonb),
    '{trigger_keywords}',
    jsonb_build_array(trim(payload->>'trigger_keyword')),
    true
)
WHERE COALESCE(payload, '{}'::jsonb) ? 'trigger_keyword'
  AND length(trim(COALESCE(payload->>'trigger_keyword', ''))) > 0
  AND (
    jsonb_typeof(payload->'trigger_keywords') IS DISTINCT FROM 'array'
    OR jsonb_array_length(COALESCE(payload->'trigger_keywords', '[]'::jsonb)) = 0
  );

-- Force trigger_keywords to be a JSON array.
UPDATE public.automation_tasks
SET payload = jsonb_set(
    COALESCE(payload, '{}'::jsonb),
    '{trigger_keywords}',
    CASE
        WHEN jsonb_typeof(payload->'trigger_keywords') = 'array'
            THEN payload->'trigger_keywords'
        WHEN jsonb_typeof(payload->'trigger_keywords') = 'string'
             AND length(trim(payload->>'trigger_keywords')) > 0
            THEN jsonb_build_array(trim(payload->>'trigger_keywords'))
        ELSE '[]'::jsonb
    END,
    true
)
WHERE jsonb_typeof(COALESCE(payload, '{}'::jsonb)->'trigger_keywords')
      IS DISTINCT FROM 'array';

-- Drop the old key from payload.
UPDATE public.automation_tasks
SET payload = payload - 'trigger_keyword'
WHERE payload ? 'trigger_keyword';

-- automation_funnels: replace the varchar column with trigger_keywords jsonb.
ALTER TABLE public.automation_funnels
    ADD COLUMN IF NOT EXISTS trigger_keywords jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.automation_funnels
SET trigger_keywords = jsonb_build_array(trim(trigger_keyword))
WHERE trigger_keyword IS NOT NULL
  AND length(trim(trigger_keyword)) > 0
  AND trigger_keywords = '[]'::jsonb;

ALTER TABLE public.automation_funnels
    DROP COLUMN IF EXISTS trigger_keyword;

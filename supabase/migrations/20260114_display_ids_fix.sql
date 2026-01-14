-- Fix for sequence setval that can't handle 0 values
-- This runs after the main display_ids migration to ensure sequences are set correctly

-- Reset sequences only if there are records (sequences start at 1 by default)
DO $$
DECLARE
  max_val INTEGER;
BEGIN
  SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) INTO max_val FROM actions WHERE display_id IS NOT NULL;
  IF max_val IS NOT NULL AND max_val >= 1 THEN
    PERFORM setval('action_display_id_seq', max_val);
  END IF;

  SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) INTO max_val FROM threats WHERE display_id IS NOT NULL;
  IF max_val IS NOT NULL AND max_val >= 1 THEN
    PERFORM setval('threat_display_id_seq', max_val);
  END IF;

  SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) INTO max_val FROM technical_queries WHERE display_id IS NOT NULL;
  IF max_val IS NOT NULL AND max_val >= 1 THEN
    PERFORM setval('query_display_id_seq', max_val);
  END IF;

  SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) INTO max_val FROM decisions WHERE display_id IS NOT NULL;
  IF max_val IS NOT NULL AND max_val >= 1 THEN
    PERFORM setval('decision_display_id_seq', max_val);
  END IF;

  SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) INTO max_val FROM milestones WHERE display_id IS NOT NULL;
  IF max_val IS NOT NULL AND max_val >= 1 THEN
    PERFORM setval('milestone_display_id_seq', max_val);
  END IF;
END $$;

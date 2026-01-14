-- Fix for sequence setval that can't handle 0 values
-- This runs after the main display_ids migration to ensure sequences are set correctly

-- Reset sequences to at least 1
SELECT setval('action_display_id_seq', GREATEST(1, COALESCE((SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) FROM actions WHERE display_id IS NOT NULL), 1)));
SELECT setval('threat_display_id_seq', GREATEST(1, COALESCE((SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) FROM threats WHERE display_id IS NOT NULL), 1)));
SELECT setval('query_display_id_seq', GREATEST(1, COALESCE((SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) FROM technical_queries WHERE display_id IS NOT NULL), 1)));
SELECT setval('decision_display_id_seq', GREATEST(1, COALESCE((SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) FROM decisions WHERE display_id IS NOT NULL), 1)));
SELECT setval('milestone_display_id_seq', GREATEST(1, COALESCE((SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) FROM milestones WHERE display_id IS NOT NULL), 1)));

-- Backfill action_audit with 'created' entries for actions that don't have them
-- This ensures all actions show at least "Created" in the dashboard's "what changed" feature

INSERT INTO action_audit (action_id, user_id, change_type, new_value, created_at)
SELECT
    a.id,
    a.created_by,
    'created',
    a.title,
    a.created_at
FROM actions a
WHERE NOT EXISTS (
    SELECT 1 FROM action_audit aa
    WHERE aa.action_id = a.id AND aa.change_type = 'created'
);

-- Also backfill 'status_changed' for completed actions that don't have that audit entry
INSERT INTO action_audit (action_id, user_id, change_type, old_value, new_value, created_at)
SELECT
    a.id,
    a.created_by,
    'status_changed',
    'pending',
    a.status,
    COALESCE(a.completed_at, a.updated_at)
FROM actions a
WHERE a.status = 'complete'
AND NOT EXISTS (
    SELECT 1 FROM action_audit aa
    WHERE aa.action_id = a.id
    AND aa.change_type = 'status_changed'
    AND aa.new_value = 'complete'
);

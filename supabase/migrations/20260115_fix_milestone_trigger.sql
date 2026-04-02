-- Fix milestone completion trigger to use correct column names
-- The original trigger referenced 'completed_by' which doesn't exist

CREATE OR REPLACE FUNCTION create_milestone_completion_update()
RETURNS TRIGGER AS $$
DECLARE
  settings_value JSONB;
  auto_log BOOLEAN;
BEGIN
  -- Check if auto-logging is enabled
  SELECT value INTO settings_value FROM system_settings WHERE key = 'updates_config';
  auto_log := COALESCE((settings_value->>'auto_log_completed_milestones')::boolean, true);

  IF auto_log AND NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    INSERT INTO updates (content, workstream_id, posted_at, created_by, source_type, source_id)
    VALUES (
      'Milestone completed: ' || NEW.title,
      NEW.workstream_id,
      COALESCE(NEW.completed_at, NOW()),
      NEW.created_by, -- Use created_by since there's no completed_by column
      'milestone_completed',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

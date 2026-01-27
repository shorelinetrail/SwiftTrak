-- Updates feature: Announcements and activity ticker
-- This creates a system for posting updates and tracking activity

-- Updates table for manual announcements/updates
CREATE TABLE IF NOT EXISTS updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  workstream_id UUID REFERENCES workstreams(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,

  -- For auto-generated updates (milestones, actions)
  source_type TEXT, -- 'manual', 'milestone_completed', 'action_completed'
  source_id UUID -- Reference to the source entity
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_updates_posted_at ON updates(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_updates_workstream_id ON updates(workstream_id);
CREATE INDEX IF NOT EXISTS idx_updates_source ON updates(source_type, source_id);

-- System settings table for admin configuration
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings for updates feature
INSERT INTO system_settings (key, value) VALUES
  ('updates_config', '{"auto_log_completed_milestones": true, "auto_log_completed_actions": false}')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for updates
CREATE POLICY "Users can view all updates" ON updates FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create updates" ON updates FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update their own updates" ON updates FOR UPDATE USING (created_by = auth.uid());
CREATE POLICY "Users can delete their own updates" ON updates FOR DELETE USING (created_by = auth.uid());

-- RLS Policies for system_settings
CREATE POLICY "Users can view system settings" ON system_settings FOR SELECT USING (true);
CREATE POLICY "Only admins can modify system settings" ON system_settings FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  )
);

-- Function to auto-create update when milestone is completed
CREATE OR REPLACE FUNCTION create_milestone_completion_update()
RETURNS TRIGGER AS $$
DECLARE
  settings_value JSONB;
  auto_log BOOLEAN;
BEGIN
  -- Check if auto-logging is enabled
  SELECT value INTO settings_value FROM system_settings WHERE key = 'updates_config';
  auto_log := COALESCE((settings_value->>'auto_log_completed_milestones')::boolean, true);

  IF auto_log AND NEW.status = 'complete' AND (OLD.status IS NULL OR OLD.status != 'complete') THEN
    INSERT INTO updates (content, workstream_id, posted_at, created_by, source_type, source_id)
    VALUES (
      'Milestone completed: ' || NEW.title,
      NEW.workstream_id,
      COALESCE(NEW.completed_at, NOW()),
      COALESCE(NEW.completed_by, NEW.created_by),
      'milestone_completed',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-create update when action is completed
CREATE OR REPLACE FUNCTION create_action_completion_update()
RETURNS TRIGGER AS $$
DECLARE
  settings_value JSONB;
  auto_log BOOLEAN;
BEGIN
  -- Check if auto-logging is enabled
  SELECT value INTO settings_value FROM system_settings WHERE key = 'updates_config';
  auto_log := COALESCE((settings_value->>'auto_log_completed_actions')::boolean, false);

  IF auto_log AND NEW.status = 'complete' AND (OLD.status IS NULL OR OLD.status != 'complete') THEN
    INSERT INTO updates (content, workstream_id, posted_at, created_by, source_type, source_id)
    VALUES (
      'Action completed: ' || NEW.title,
      NEW.workstream_id,
      COALESCE(NEW.completed_at, NOW()),
      COALESCE(NEW.owner_id, NEW.created_by),
      'action_completed',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
DROP TRIGGER IF EXISTS milestone_completion_update_trigger ON milestones;
CREATE TRIGGER milestone_completion_update_trigger
  AFTER UPDATE ON milestones
  FOR EACH ROW
  EXECUTE FUNCTION create_milestone_completion_update();

DROP TRIGGER IF EXISTS action_completion_update_trigger ON actions;
CREATE TRIGGER action_completion_update_trigger
  AFTER UPDATE ON actions
  FOR EACH ROW
  EXECUTE FUNCTION create_action_completion_update();

-- Create threat_action_links table for many-to-many relationship between threats and actions
CREATE TABLE IF NOT EXISTS threat_action_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_id UUID NOT NULL REFERENCES threats(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(threat_id, action_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_threat_action_links_threat_id ON threat_action_links(threat_id);
CREATE INDEX IF NOT EXISTS idx_threat_action_links_action_id ON threat_action_links(action_id);

-- Enable RLS
ALTER TABLE threat_action_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view threat action links" ON threat_action_links
  FOR SELECT USING (true);

CREATE POLICY "Users can insert threat action links" ON threat_action_links
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete threat action links" ON threat_action_links
  FOR DELETE USING (true);

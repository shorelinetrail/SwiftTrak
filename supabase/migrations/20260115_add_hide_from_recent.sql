-- Add hide_from_recent column to action_audit table
-- This allows admins to hide certain updates from the "recently updated" dashboard section

ALTER TABLE action_audit ADD COLUMN IF NOT EXISTS hide_from_recent BOOLEAN NOT NULL DEFAULT false;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_action_audit_hide_from_recent ON action_audit(hide_from_recent) WHERE hide_from_recent = false;

-- Allow admins to update action_audit to hide entries
CREATE POLICY "Admins can update action audit" ON action_audit FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

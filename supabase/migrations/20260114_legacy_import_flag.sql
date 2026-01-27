-- Add flag to identify legacy imported comments
ALTER TABLE action_updates ADD COLUMN IF NOT EXISTS is_legacy_import BOOLEAN DEFAULT FALSE;

-- Migration: Make priority optional for actions
-- This allows importing legacy actions without a priority

-- Remove NOT NULL constraint from priority in actions table
ALTER TABLE actions ALTER COLUMN priority DROP NOT NULL;

-- Update check constraint to allow NULL
ALTER TABLE actions DROP CONSTRAINT IF EXISTS actions_priority_check;
ALTER TABLE actions ADD CONSTRAINT actions_priority_check
  CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low'));

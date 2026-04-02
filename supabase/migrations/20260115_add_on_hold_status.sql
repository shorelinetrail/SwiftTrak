-- Add 'on_hold' status to actions table
-- Drop the existing check constraint and recreate with the new value

ALTER TABLE actions DROP CONSTRAINT IF EXISTS actions_status_check;

ALTER TABLE actions ADD CONSTRAINT actions_status_check
    CHECK (status IN ('pending', 'in_progress', 'on_hold', 'complete', 'cancelled'));

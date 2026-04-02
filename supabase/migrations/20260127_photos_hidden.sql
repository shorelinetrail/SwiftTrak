-- Migration: Add hidden photo functionality for admin-only file area
-- Hidden photos are only visible to admin users

-- Add is_hidden column to workstream_photos
ALTER TABLE workstream_photos ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for efficient hidden photo queries
CREATE INDEX IF NOT EXISTS idx_workstream_photos_hidden ON workstream_photos(is_hidden) WHERE is_hidden = TRUE;

-- Update RLS policy for viewing photos to respect hidden status
-- Drop the old policy first
DROP POLICY IF EXISTS "Anyone can view photos" ON workstream_photos;

-- Create new policy: Non-hidden photos visible to all, hidden photos only to admins
CREATE POLICY "View photos based on hidden status" ON workstream_photos
    FOR SELECT USING (
        is_hidden = FALSE OR
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

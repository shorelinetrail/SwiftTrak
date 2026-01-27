-- Migration: Add threat updates (comments) and fix users table for pending users
-- =====================================================

-- =====================================================
-- FIX USERS TABLE FOR PENDING USERS
-- =====================================================
-- Drop the foreign key constraint on users.id so we can create pending users
-- with generated UUIDs before they sign up via Supabase Auth
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- Add auth_linked column to track if user is linked to auth.users
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_linked BOOLEAN NOT NULL DEFAULT true;

-- For pending users, set auth_linked to false
-- (This will be set properly for new pending users in the application)

-- Update the handle_new_user function to link pending users and set auth_linked
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    existing_user_id UUID;
BEGIN
    -- Check if there's a pending user with this email
    SELECT id INTO existing_user_id
    FROM users
    WHERE email = NEW.email AND status = 'pending';

    IF existing_user_id IS NOT NULL THEN
        -- Update the existing pending user: update their ID to match auth ID, set status to active
        UPDATE users
        SET id = NEW.id,
            status = 'active',
            auth_linked = true,
            full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name)
        WHERE email = NEW.email AND status = 'pending';
    ELSE
        -- Create new user (new signup, no pending record)
        INSERT INTO users (id, email, full_name, role, status, auth_linked)
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
            'view',
            'active',
            true
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- THREAT UPDATES (COMMENTS) TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS threat_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    threat_id UUID NOT NULL REFERENCES threats(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on threat_updates
ALTER TABLE threat_updates ENABLE ROW LEVEL SECURITY;

-- Policies for threat_updates
CREATE POLICY "Anyone can view threat updates" ON threat_updates FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert threat updates" ON threat_updates FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update their own threat updates" ON threat_updates FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own threat updates" ON threat_updates FOR DELETE USING (user_id = auth.uid());

-- Indexes for threat_updates
CREATE INDEX IF NOT EXISTS idx_threat_updates_threat ON threat_updates(threat_id);
CREATE INDEX IF NOT EXISTS idx_threat_updates_user ON threat_updates(user_id);
CREATE INDEX IF NOT EXISTS idx_threat_updates_created ON threat_updates(created_at);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_threat_updates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS threat_updates_updated_at ON threat_updates;
CREATE TRIGGER threat_updates_updated_at
    BEFORE UPDATE ON threat_updates
    FOR EACH ROW EXECUTE FUNCTION update_threat_updates_updated_at();

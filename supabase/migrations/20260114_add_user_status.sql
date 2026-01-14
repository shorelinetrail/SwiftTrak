-- Migration: Add status and invited_by fields to users table for admin user pre-creation
-- This allows admins to create pending users before they sign up

-- Add status column to track if user is active or pending
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending'));

-- Add invited_by column to track who created the pending user
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Allow admins to insert new users (for creating pending users)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can insert users' AND tablename = 'users') THEN
        CREATE POLICY "Admins can insert users" ON users FOR INSERT WITH CHECK (
            EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
        );
    END IF;
END $$;

-- Update the handle_new_user function to handle pending user linking
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    existing_user_id UUID;
BEGIN
    -- Check if there's a pending user with this email
    SELECT id INTO existing_user_id
    FROM public.users
    WHERE email = NEW.email AND status = 'pending';

    IF existing_user_id IS NOT NULL THEN
        -- Update the existing pending user to link with the new auth user
        UPDATE public.users
        SET
            id = NEW.id,
            full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
            status = 'active',
            updated_at = NOW()
        WHERE id = existing_user_id;
    ELSE
        -- Create new user profile as before
        INSERT INTO public.users (id, email, full_name, role, status)
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
            'view',
            'active'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

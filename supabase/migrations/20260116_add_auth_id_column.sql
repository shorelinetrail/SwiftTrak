-- Migration: Add auth_id column for cleaner pending user linking
-- Instead of changing the user's id when they sign up, we keep the id stable
-- and add auth_id to link to the Supabase auth system.
-- This preserves all foreign key references when a pending user signs up.

-- Add auth_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;

-- For existing active users, set auth_id = id (they were created with id matching auth)
UPDATE users SET auth_id = id WHERE auth_linked = true AND auth_id IS NULL;

-- Create index for auth_id lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- Update the handle_new_user function to simply UPDATE the pending user
-- instead of deleting and recreating (which breaks FK references)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    pending_user RECORD;
BEGIN
    -- Check if there's a pending user with this email
    SELECT * INTO pending_user
    FROM public.users
    WHERE email = NEW.email AND status = 'pending';

    IF pending_user.id IS NOT NULL THEN
        -- Simply UPDATE the pending user - this preserves the id and all FK references
        UPDATE public.users
        SET
            auth_id = NEW.id,
            status = 'active',
            auth_linked = true,
            full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
            updated_at = NOW()
        WHERE id = pending_user.id;

        RAISE NOTICE 'Linked pending user % to auth user %', pending_user.id, NEW.id;
    ELSE
        -- Create new user (new signup, no pending record)
        -- For new users, id = auth_id since there's no prior record
        INSERT INTO public.users (id, auth_id, email, full_name, role, status, auth_linked)
        VALUES (
            NEW.id,
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

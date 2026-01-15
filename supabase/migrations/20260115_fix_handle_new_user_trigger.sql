-- Fix handle_new_user trigger to properly handle pending user linking
-- The previous version tried to UPDATE the primary key which can fail
-- if there are foreign key references to the old user ID.
-- This version deletes the old record and creates a new one.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    pending_user RECORD;
BEGIN
    -- Check if there's a pending user with this email
    SELECT * INTO pending_user
    FROM users
    WHERE email = NEW.email AND status = 'pending';

    IF pending_user.id IS NOT NULL THEN
        -- Delete the pending user record
        DELETE FROM users WHERE id = pending_user.id;

        -- Create new user with auth ID, preserving data from pending record
        INSERT INTO users (id, email, full_name, role, status, auth_linked, invited_by, invited_at)
        VALUES (
            NEW.id,
            pending_user.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', pending_user.full_name),
            pending_user.role,
            'active',
            true,
            pending_user.invited_by,
            pending_user.invited_at
        );
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
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail user creation - profile API will create user record
    RAISE WARNING 'handle_new_user trigger error: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

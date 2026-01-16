-- Fix handle_new_user trigger - correct column name mismatches
-- Previous version had wrong column names causing trigger to fail silently

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
        RAISE NOTICE 'Linking pending user % to auth user %', pending_user.id, NEW.id;

        -- Update all foreign key references from the pending user ID to the new auth user ID
        UPDATE actions SET owner_id = NEW.id WHERE owner_id = pending_user.id;
        UPDATE actions SET created_by = NEW.id WHERE created_by = pending_user.id;
        UPDATE threats SET created_by = NEW.id WHERE created_by = pending_user.id;
        UPDATE decisions SET created_by = NEW.id WHERE created_by = pending_user.id;
        UPDATE decisions SET made_by = NEW.id WHERE made_by = pending_user.id;
        UPDATE milestones SET created_by = NEW.id WHERE created_by = pending_user.id;
        UPDATE technical_queries SET submitted_by = NEW.id WHERE submitted_by = pending_user.id;
        UPDATE technical_queries SET assigned_to = NEW.id WHERE assigned_to = pending_user.id;
        UPDATE action_updates SET user_id = NEW.id WHERE user_id = pending_user.id;
        UPDATE threat_updates SET user_id = NEW.id WHERE user_id = pending_user.id;
        UPDATE updates SET created_by = NEW.id WHERE created_by = pending_user.id;

        -- Update audit tables (column is user_id, not changed_by)
        UPDATE action_audit SET user_id = NEW.id WHERE user_id = pending_user.id;
        UPDATE threat_audit SET user_id = NEW.id WHERE user_id = pending_user.id;
        UPDATE decision_audit SET user_id = NEW.id WHERE user_id = pending_user.id;
        UPDATE milestone_audit SET user_id = NEW.id WHERE user_id = pending_user.id;

        -- Update notifications
        UPDATE notifications SET user_id = NEW.id WHERE user_id = pending_user.id;

        -- Update invited_by references
        UPDATE users SET invited_by = NEW.id WHERE invited_by = pending_user.id;

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

        RAISE NOTICE 'Successfully linked pending user to auth user %', NEW.id;
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
    -- Log error but don't fail user creation - profile API will handle it as fallback
    RAISE WARNING 'handle_new_user trigger error: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

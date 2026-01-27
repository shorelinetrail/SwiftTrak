-- Fix orphaned action references for users who signed up before the trigger was fixed
-- This finds actions that reference a user ID that doesn't exist and tries to match
-- them to the correct user by finding a user with the same email.

-- First, let's update actions where owner_id references a non-existent user
-- by finding the correct user via email matching in auth.users

DO $$
DECLARE
    orphan RECORD;
    correct_user_id UUID;
BEGIN
    -- Find actions with owner_id that doesn't exist in users table
    FOR orphan IN
        SELECT DISTINCT a.owner_id, au.email
        FROM actions a
        LEFT JOIN users u ON a.owner_id = u.id
        JOIN auth.users au ON au.email = (
            SELECT email FROM users WHERE id = a.owner_id
            UNION
            SELECT au2.email FROM auth.users au2 WHERE au2.id = a.owner_id
            LIMIT 1
        )
        WHERE u.id IS NULL AND a.owner_id IS NOT NULL
    LOOP
        -- Find the correct user ID by email
        SELECT id INTO correct_user_id
        FROM users
        WHERE email = orphan.email
        LIMIT 1;

        IF correct_user_id IS NOT NULL THEN
            UPDATE actions SET owner_id = correct_user_id WHERE owner_id = orphan.owner_id;
            RAISE NOTICE 'Updated actions from % to %', orphan.owner_id, correct_user_id;
        END IF;
    END LOOP;
END $$;

-- Migration: Add system user for bulk imports and automated actions
-- This user is used when importing legacy data without a specific creator

-- Insert the system user if it doesn't exist
-- Using a fixed UUID so it can be referenced consistently
INSERT INTO users (id, email, full_name, role, auth_linked)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'system@swifttrak.local',
    'System',
    'view',
    false
)
ON CONFLICT (id) DO UPDATE SET
    full_name = 'System',
    email = 'system@swifttrak.local';

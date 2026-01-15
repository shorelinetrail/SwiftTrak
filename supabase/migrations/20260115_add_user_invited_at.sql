-- Add invited_at column to track when a user was invited
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_users_invited_at ON users(invited_at);

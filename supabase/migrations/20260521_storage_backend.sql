-- Add storage_backend column to track where files are stored
-- Existing files are in Supabase Storage, new uploads go to Cloudflare R2
ALTER TABLE workstream_photos
  ADD COLUMN IF NOT EXISTS storage_backend TEXT NOT NULL DEFAULT 'supabase';

COMMENT ON COLUMN workstream_photos.storage_backend IS 'Storage provider: supabase or r2';

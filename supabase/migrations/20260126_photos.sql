-- Migration: Add photos feature for workstream documentation
-- Photos are organized by workstream (albums) and sorted by EXIF taken_at date

-- Create workstream_photos table
CREATE TABLE IF NOT EXISTS workstream_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workstream_id UUID NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    original_filename TEXT NOT NULL,
    taken_at TIMESTAMPTZ, -- EXIF date for sorting
    caption TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_workstream_photos_workstream ON workstream_photos(workstream_id);
CREATE INDEX IF NOT EXISTS idx_workstream_photos_taken_at ON workstream_photos(taken_at NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_workstream_photos_uploaded_by ON workstream_photos(uploaded_by);

-- Enable RLS
ALTER TABLE workstream_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view photos
CREATE POLICY "Anyone can view photos" ON workstream_photos
    FOR SELECT USING (true);

-- Edit users can upload photos
CREATE POLICY "Edit users can upload photos" ON workstream_photos
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
    );

-- Edit users can update their own photos, admins can update any
CREATE POLICY "Users can update own photos" ON workstream_photos
    FOR UPDATE USING (
        uploaded_by = auth.uid() OR
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Edit users can delete their own photos, admins can delete any
CREATE POLICY "Users can delete own photos" ON workstream_photos
    FOR DELETE USING (
        uploaded_by = auth.uid() OR
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Storage bucket setup (run in Supabase dashboard or via CLI)
-- The photos bucket should be created with:
-- - Name: 'photos'
-- - Public: false (secure access via signed URLs only)
-- - File size limit: 10MB
-- - Allowed MIME types: image/jpeg, image/png, image/webp

-- Storage policies (to be applied via Supabase dashboard):
-- 1. Authenticated read: SELECT for authenticated users only
-- 2. Authenticated upload: INSERT for authenticated users with edit/admin role
-- 3. Owner/admin delete: DELETE for file owner or admin users
--
-- Example storage policies SQL:
--
-- Allow authenticated users to read photos:
-- CREATE POLICY "Authenticated users can read photos"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (bucket_id = 'photos');
--
-- Allow edit/admin users to upload:
-- CREATE POLICY "Edit users can upload photos"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (
--   bucket_id = 'photos' AND
--   EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
-- );
--
-- Allow owner or admin to delete:
-- CREATE POLICY "Owner or admin can delete photos"
-- ON storage.objects FOR DELETE
-- TO authenticated
-- USING (
--   bucket_id = 'photos' AND
--   (auth.uid()::text = (storage.foldername(name))[1] OR
--    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'))
-- );

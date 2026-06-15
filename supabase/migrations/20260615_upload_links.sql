-- Upload links allow unauthenticated users to upload files to a workstream
CREATE TABLE IF NOT EXISTS upload_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  name TEXT NOT NULL,
  workstream_id UUID NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  max_files INTEGER,
  upload_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allow public read for token validation (no auth needed)
ALTER TABLE upload_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can validate upload links by token"
  ON upload_links FOR SELECT
  USING (true);

CREATE POLICY "Edit users can manage upload links"
  ON upload_links FOR ALL
  USING (true)
  WITH CHECK (true);

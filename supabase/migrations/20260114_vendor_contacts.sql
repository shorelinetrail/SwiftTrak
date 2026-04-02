-- Create vendor_contacts table for multiple contacts per vendor
CREATE TABLE IF NOT EXISTS vendor_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  job_title VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(100),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor_id ON vendor_contacts(vendor_id);

-- Enable RLS
ALTER TABLE vendor_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view vendor contacts" ON vendor_contacts
  FOR SELECT USING (true);

CREATE POLICY "Users can insert vendor contacts" ON vendor_contacts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update vendor contacts" ON vendor_contacts
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete vendor contacts" ON vendor_contacts
  FOR DELETE USING (true);

-- Migrate existing contact data from vendors table to vendor_contacts
INSERT INTO vendor_contacts (vendor_id, name, email, phone, is_primary, created_by)
SELECT
  id as vendor_id,
  contact_name as name,
  contact_email as email,
  contact_phone as phone,
  true as is_primary,
  created_by
FROM vendors
WHERE contact_name IS NOT NULL AND contact_name != '';

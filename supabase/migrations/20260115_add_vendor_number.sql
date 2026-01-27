-- Add vendor_number field to vendors table
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS vendor_number TEXT;

-- Create index for searching by vendor number
CREATE INDEX IF NOT EXISTS idx_vendors_vendor_number ON vendors(vendor_number);

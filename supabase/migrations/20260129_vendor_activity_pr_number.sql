-- Add purchase_requisition column to vendor_activities table
-- This allows tracking of PR numbers before POs are raised

ALTER TABLE vendor_activities
ADD COLUMN IF NOT EXISTS purchase_requisition TEXT;

-- Add index for searching by PR number
CREATE INDEX IF NOT EXISTS idx_vendor_activities_purchase_requisition
ON vendor_activities(purchase_requisition)
WHERE purchase_requisition IS NOT NULL;

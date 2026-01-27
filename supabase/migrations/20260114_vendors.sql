-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendor activities (multiple entries per vendor)
CREATE TABLE IF NOT EXISTS vendor_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    purchase_order TEXT,
    purchase_order_value DECIMAL(12, 2),
    provisional_start_date DATE,
    provisional_end_date DATE,
    confirmed_start_date DATE,
    confirmed_end_date DATE,
    status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'confirmed', 'in_progress', 'complete', 'cancelled')),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link actions to vendors
CREATE TABLE IF NOT EXISTS vendor_action_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vendor_id, action_id)
);

-- Vendor audit log
CREATE TABLE IF NOT EXISTS vendor_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    change_type TEXT NOT NULL,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity audit log
CREATE TABLE IF NOT EXISTS vendor_activity_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES vendor_activities(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    change_type TEXT NOT NULL,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_action_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_activity_audit ENABLE ROW LEVEL SECURITY;

-- Policies for vendors (all authenticated users can view, editors can modify)
CREATE POLICY "Users can view all vendors" ON vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert vendors" ON vendors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update vendors" ON vendors FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete vendors" ON vendors FOR DELETE TO authenticated USING (true);

-- Policies for vendor_activities
CREATE POLICY "Users can view all vendor activities" ON vendor_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert vendor activities" ON vendor_activities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update vendor activities" ON vendor_activities FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete vendor activities" ON vendor_activities FOR DELETE TO authenticated USING (true);

-- Policies for vendor_action_links
CREATE POLICY "Users can view all vendor action links" ON vendor_action_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert vendor action links" ON vendor_action_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can delete vendor action links" ON vendor_action_links FOR DELETE TO authenticated USING (true);

-- Policies for audit tables
CREATE POLICY "Users can view vendor audit" ON vendor_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert vendor audit" ON vendor_audit FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can view vendor activity audit" ON vendor_activity_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert vendor activity audit" ON vendor_activity_audit FOR INSERT TO authenticated WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vendor_activities_vendor_id ON vendor_activities(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_action_links_vendor_id ON vendor_action_links(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_action_links_action_id ON vendor_action_links(action_id);
CREATE INDEX IF NOT EXISTS idx_vendor_audit_vendor_id ON vendor_audit(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_activity_audit_activity_id ON vendor_activity_audit(activity_id);

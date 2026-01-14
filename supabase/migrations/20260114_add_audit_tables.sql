-- Migration: Add audit tables for threats, decisions, and milestones
-- Also adds status field to threats for open/closed tracking

-- =====================================================
-- THREAT STATUS FIELD
-- =====================================================
ALTER TABLE threats ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'));

-- Create index for threat status
CREATE INDEX IF NOT EXISTS idx_threats_status ON threats(status);

-- =====================================================
-- THREAT AUDIT TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS threat_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    threat_id UUID NOT NULL REFERENCES threats(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    change_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on threat_audit
ALTER TABLE threat_audit ENABLE ROW LEVEL SECURITY;

-- Policies for threat_audit
CREATE POLICY "Anyone can view threat audit" ON threat_audit FOR SELECT USING (true);

-- Index for threat_audit
CREATE INDEX IF NOT EXISTS idx_threat_audit_threat ON threat_audit(threat_id);

-- Trigger function for threat changes
CREATE OR REPLACE FUNCTION audit_threat_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO threat_audit (threat_id, user_id, change_type, new_value)
        VALUES (NEW.id, NEW.created_by, 'created', NEW.title);
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO threat_audit (threat_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
        END IF;
        IF OLD.current_risk IS DISTINCT FROM NEW.current_risk THEN
            INSERT INTO threat_audit (threat_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'risk_changed', OLD.current_risk, NEW.current_risk);
        END IF;
        IF OLD.title IS DISTINCT FROM NEW.title THEN
            INSERT INTO threat_audit (threat_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'title_changed', OLD.title, NEW.title);
        END IF;
        IF OLD.mitigated_risk IS DISTINCT FROM NEW.mitigated_risk THEN
            INSERT INTO threat_audit (threat_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'mitigated_risk_changed', OLD.mitigated_risk, NEW.mitigated_risk);
        END IF;
        IF OLD.solution IS DISTINCT FROM NEW.solution AND NEW.solution IS NOT NULL AND NEW.solution != '' THEN
            INSERT INTO threat_audit (threat_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'solution_added', NULL, 'Solution provided');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for threat audit
DROP TRIGGER IF EXISTS threat_audit_trigger ON threats;
CREATE TRIGGER threat_audit_trigger
    AFTER INSERT OR UPDATE ON threats
    FOR EACH ROW EXECUTE FUNCTION audit_threat_changes();

-- =====================================================
-- DECISION AUDIT TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS decision_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    change_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on decision_audit
ALTER TABLE decision_audit ENABLE ROW LEVEL SECURITY;

-- Policies for decision_audit
CREATE POLICY "Anyone can view decision audit" ON decision_audit FOR SELECT USING (true);

-- Index for decision_audit
CREATE INDEX IF NOT EXISTS idx_decision_audit_decision ON decision_audit(decision_id);

-- Trigger function for decision changes
CREATE OR REPLACE FUNCTION audit_decision_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO decision_audit (decision_id, user_id, change_type, new_value)
        VALUES (NEW.id, NEW.made_by, 'created', NEW.title);
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.title IS DISTINCT FROM NEW.title THEN
            INSERT INTO decision_audit (decision_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'title_changed', OLD.title, NEW.title);
        END IF;
        IF OLD.rationale IS DISTINCT FROM NEW.rationale THEN
            INSERT INTO decision_audit (decision_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'rationale_changed', OLD.rationale, NEW.rationale);
        END IF;
        IF OLD.impact IS DISTINCT FROM NEW.impact THEN
            INSERT INTO decision_audit (decision_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'impact_changed', OLD.impact, NEW.impact);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for decision audit
DROP TRIGGER IF EXISTS decision_audit_trigger ON decisions;
CREATE TRIGGER decision_audit_trigger
    AFTER INSERT OR UPDATE ON decisions
    FOR EACH ROW EXECUTE FUNCTION audit_decision_changes();

-- =====================================================
-- MILESTONE AUDIT TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS milestone_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    change_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on milestone_audit
ALTER TABLE milestone_audit ENABLE ROW LEVEL SECURITY;

-- Policies for milestone_audit
CREATE POLICY "Anyone can view milestone audit" ON milestone_audit FOR SELECT USING (true);

-- Index for milestone_audit
CREATE INDEX IF NOT EXISTS idx_milestone_audit_milestone ON milestone_audit(milestone_id);

-- Trigger function for milestone changes
CREATE OR REPLACE FUNCTION audit_milestone_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO milestone_audit (milestone_id, user_id, change_type, new_value)
        VALUES (NEW.id, NEW.created_by, 'created', NEW.title);
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO milestone_audit (milestone_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
        END IF;
        IF OLD.title IS DISTINCT FROM NEW.title THEN
            INSERT INTO milestone_audit (milestone_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'title_changed', OLD.title, NEW.title);
        END IF;
        IF OLD.target_date IS DISTINCT FROM NEW.target_date THEN
            INSERT INTO milestone_audit (milestone_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'target_date_changed', OLD.target_date::text, NEW.target_date::text);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for milestone audit
DROP TRIGGER IF EXISTS milestone_audit_trigger ON milestones;
CREATE TRIGGER milestone_audit_trigger
    AFTER INSERT OR UPDATE ON milestones
    FOR EACH ROW EXECUTE FUNCTION audit_milestone_changes();

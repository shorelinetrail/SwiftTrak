-- SwiftTrak Crisis Management System Database Schema
-- Run this SQL in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'view' CHECK (role IN ('admin', 'edit', 'view')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create user profile on auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        'view'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- WORKSTREAMS TABLE
-- =====================================================
CREATE TABLE workstreams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#dc2626',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- USER WORKSTREAM PERMISSIONS
-- =====================================================
CREATE TABLE user_workstream_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workstream_id UUID NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK (permission IN ('admin', 'edit', 'view')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, workstream_id)
);

-- =====================================================
-- ACTIONS TABLE
-- =====================================================
CREATE TABLE actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    workstream_id UUID NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'complete', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completion_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- ACTION UPDATES (Status updates / Comments)
-- =====================================================
CREATE TABLE action_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- ACTION AUDIT TRAIL
-- =====================================================
CREATE TABLE action_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    change_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create audit entries on action changes
CREATE OR REPLACE FUNCTION audit_action_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO action_audit (action_id, user_id, change_type, new_value)
        VALUES (NEW.id, NEW.created_by, 'created', NEW.title);
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO action_audit (action_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
        END IF;
        IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
            INSERT INTO action_audit (action_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'owner_changed', OLD.owner_id::text, NEW.owner_id::text);
        END IF;
        IF OLD.priority IS DISTINCT FROM NEW.priority THEN
            INSERT INTO action_audit (action_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'priority_changed', OLD.priority, NEW.priority);
        END IF;
        IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
            INSERT INTO action_audit (action_id, user_id, change_type, old_value, new_value)
            VALUES (NEW.id, auth.uid(), 'due_date_changed', OLD.due_date::text, NEW.due_date::text);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER action_audit_trigger
    AFTER INSERT OR UPDATE ON actions
    FOR EACH ROW EXECUTE FUNCTION audit_action_changes();

-- =====================================================
-- THREATS TABLE
-- =====================================================
CREATE TABLE threats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    workstream_id UUID NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
    proposed_mitigation TEXT,
    expected_delay TEXT,
    unmitigated_risk TEXT NOT NULL DEFAULT 'medium' CHECK (unmitigated_risk IN ('low', 'medium', 'high')),
    current_risk TEXT NOT NULL DEFAULT 'medium' CHECK (current_risk IN ('low', 'medium', 'high')),
    solution TEXT,
    mitigated_risk TEXT CHECK (mitigated_risk IN ('low', 'medium', 'high')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- TECHNICAL QUERIES TABLE
-- =====================================================
CREATE TABLE technical_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    workstream_id UUID REFERENCES workstreams(id) ON DELETE SET NULL,
    submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
    response TEXT,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- DECISIONS TABLE
-- =====================================================
CREATE TABLE decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    workstream_id UUID REFERENCES workstreams(id) ON DELETE SET NULL,
    made_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rationale TEXT,
    impact TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- MILESTONES TABLE
-- =====================================================
CREATE TABLE milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    workstream_id UUID REFERENCES workstreams(id) ON DELETE SET NULL,
    target_date TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- GANTT TASKS TABLE
-- =====================================================
CREATE TABLE gantt_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    workstream_id UUID REFERENCES workstreams(id) ON DELETE SET NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    parent_id UUID REFERENCES gantt_tasks(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    optimistic_duration INTEGER,
    pessimistic_duration INTEGER,
    most_likely_duration INTEGER,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    constraint_type TEXT DEFAULT 'none' CHECK (constraint_type IN ('none', 'start_no_earlier_than', 'finish_no_later_than', 'must_start_on', 'must_finish_on')),
    constraint_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- GANTT DEPENDENCIES TABLE
-- =====================================================
CREATE TABLE gantt_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES gantt_tasks(id) ON DELETE CASCADE,
    depends_on_id UUID NOT NULL REFERENCES gantt_tasks(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL DEFAULT 'finish_to_start' CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
    lag_days INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(task_id, depends_on_id)
);

-- =====================================================
-- ATTACHMENTS TABLE
-- =====================================================
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('action', 'threat', 'query', 'decision', 'milestone')),
    entity_id UUID NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- MENTIONS TABLE
-- =====================================================
CREATE TABLE mentions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('action_update', 'query_response', 'decision')),
    entity_id UUID NOT NULL,
    mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mentioned_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seen BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- STAKEHOLDER LINKS TABLE (Public read-only access)
-- =====================================================
CREATE TABLE stakeholder_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    name TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    workstream_ids UUID[],
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workstreams_updated_at BEFORE UPDATE ON workstreams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_actions_updated_at BEFORE UPDATE ON actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_threats_updated_at BEFORE UPDATE ON threats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_technical_queries_updated_at BEFORE UPDATE ON technical_queries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_milestones_updated_at BEFORE UPDATE ON milestones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_gantt_tasks_updated_at BEFORE UPDATE ON gantt_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workstreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_workstream_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE threats ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE gantt_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE gantt_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_links ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view all users" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update any user" ON users FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Workstreams policies
CREATE POLICY "Anyone can view workstreams" ON workstreams FOR SELECT USING (true);
CREATE POLICY "Admins can manage workstreams" ON workstreams FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Edit users can create workstreams" ON workstreams FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);

-- User workstream permissions policies
CREATE POLICY "Anyone can view permissions" ON user_workstream_permissions FOR SELECT USING (true);
CREATE POLICY "Admins can manage permissions" ON user_workstream_permissions FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Actions policies
CREATE POLICY "Anyone can view actions" ON actions FOR SELECT USING (true);
CREATE POLICY "Edit users can create actions" ON actions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);
CREATE POLICY "Edit users can update actions" ON actions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);
CREATE POLICY "Admins can delete actions" ON actions FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Action updates policies
CREATE POLICY "Anyone can view action updates" ON action_updates FOR SELECT USING (true);
CREATE POLICY "Edit users can create action updates" ON action_updates FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);

-- Action audit policies
CREATE POLICY "Anyone can view action audit" ON action_audit FOR SELECT USING (true);

-- Threats policies
CREATE POLICY "Anyone can view threats" ON threats FOR SELECT USING (true);
CREATE POLICY "Edit users can manage threats" ON threats FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);
CREATE POLICY "Edit users can update threats" ON threats FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);
CREATE POLICY "Admins can delete threats" ON threats FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Technical queries policies
CREATE POLICY "Anyone can view queries" ON technical_queries FOR SELECT USING (true);
CREATE POLICY "Edit users can create queries" ON technical_queries FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);
CREATE POLICY "Users can update their assigned queries" ON technical_queries FOR UPDATE USING (
    auth.uid() = assigned_to OR auth.uid() = submitted_by OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Decisions policies
CREATE POLICY "Anyone can view decisions" ON decisions FOR SELECT USING (true);
CREATE POLICY "Edit users can create decisions" ON decisions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);

-- Milestones policies
CREATE POLICY "Anyone can view milestones" ON milestones FOR SELECT USING (true);
CREATE POLICY "Edit users can manage milestones" ON milestones FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);
CREATE POLICY "Edit users can update milestones" ON milestones FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);
CREATE POLICY "Admins can delete milestones" ON milestones FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Gantt tasks policies
CREATE POLICY "Anyone can view gantt tasks" ON gantt_tasks FOR SELECT USING (true);
CREATE POLICY "Edit users can manage gantt tasks" ON gantt_tasks FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);

-- Gantt dependencies policies
CREATE POLICY "Anyone can view gantt dependencies" ON gantt_dependencies FOR SELECT USING (true);
CREATE POLICY "Edit users can manage gantt dependencies" ON gantt_dependencies FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);

-- Attachments policies
CREATE POLICY "Anyone can view attachments" ON attachments FOR SELECT USING (true);
CREATE POLICY "Edit users can upload attachments" ON attachments FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);
CREATE POLICY "Users can delete their own attachments" ON attachments FOR DELETE USING (
    auth.uid() = uploaded_by OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Mentions policies
CREATE POLICY "Users can view their mentions" ON mentions FOR SELECT USING (
    auth.uid() = mentioned_user_id OR auth.uid() = mentioned_by
);
CREATE POLICY "Users can create mentions" ON mentions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their mentions" ON mentions FOR UPDATE USING (
    auth.uid() = mentioned_user_id
);

-- Notifications policies
CREATE POLICY "Users can view their notifications" ON notifications FOR SELECT USING (
    auth.uid() = user_id
);
CREATE POLICY "System can create notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their notifications" ON notifications FOR UPDATE USING (
    auth.uid() = user_id
);

-- Stakeholder links policies
CREATE POLICY "Admins can manage stakeholder links" ON stakeholder_links FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Edit users can view stakeholder links" ON stakeholder_links FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'edit'))
);

-- =====================================================
-- STORAGE BUCKET FOR ATTACHMENTS
-- =====================================================
-- Run this in your Supabase dashboard or use the API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true);

-- Storage policies (run these after creating the bucket)
-- CREATE POLICY "Anyone can view attachments" ON storage.objects FOR SELECT USING (bucket_id = 'attachments');
-- CREATE POLICY "Authenticated users can upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attachments' AND auth.role() = 'authenticated');
-- CREATE POLICY "Users can delete their uploads" ON storage.objects FOR DELETE USING (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX idx_actions_workstream ON actions(workstream_id);
CREATE INDEX idx_actions_owner ON actions(owner_id);
CREATE INDEX idx_actions_status ON actions(status);
CREATE INDEX idx_actions_due_date ON actions(due_date);
CREATE INDEX idx_action_updates_action ON action_updates(action_id);
CREATE INDEX idx_action_audit_action ON action_audit(action_id);
CREATE INDEX idx_threats_workstream ON threats(workstream_id);
CREATE INDEX idx_technical_queries_assigned ON technical_queries(assigned_to);
CREATE INDEX idx_technical_queries_submitted ON technical_queries(submitted_by);
CREATE INDEX idx_decisions_workstream ON decisions(workstream_id);
CREATE INDEX idx_milestones_workstream ON milestones(workstream_id);
CREATE INDEX idx_milestones_target_date ON milestones(target_date);
CREATE INDEX idx_gantt_tasks_workstream ON gantt_tasks(workstream_id);
CREATE INDEX idx_gantt_tasks_parent ON gantt_tasks(parent_id);
CREATE INDEX idx_gantt_dependencies_task ON gantt_dependencies(task_id);
CREATE INDEX idx_gantt_dependencies_depends_on ON gantt_dependencies(depends_on_id);
CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);
CREATE INDEX idx_mentions_user ON mentions(mentioned_user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);
CREATE INDEX idx_stakeholder_links_token ON stakeholder_links(token);

-- =====================================================
-- REALTIME SUBSCRIPTIONS
-- =====================================================
-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE actions;
ALTER PUBLICATION supabase_realtime ADD TABLE action_updates;
ALTER PUBLICATION supabase_realtime ADD TABLE threats;
ALTER PUBLICATION supabase_realtime ADD TABLE technical_queries;
ALTER PUBLICATION supabase_realtime ADD TABLE decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE milestones;
ALTER PUBLICATION supabase_realtime ADD TABLE gantt_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE workstreams;

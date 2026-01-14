-- Add display_id columns to main entities for human-readable identifiers
-- Format: A-0001, T-0001, Q-0001, D-0001, M-0001

-- Create sequences for each entity type
CREATE SEQUENCE IF NOT EXISTS action_display_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS threat_display_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS query_display_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS decision_display_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS milestone_display_id_seq START 1;

-- Add display_id columns
ALTER TABLE actions ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;
ALTER TABLE threats ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;
ALTER TABLE technical_queries ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;

-- Function to generate display IDs
CREATE OR REPLACE FUNCTION generate_display_id(prefix TEXT, seq_name TEXT)
RETURNS TEXT AS $$
DECLARE
  next_val INTEGER;
BEGIN
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;
  RETURN prefix || '-' || LPAD(next_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger function for actions
CREATE OR REPLACE FUNCTION set_action_display_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('A', 'action_display_id_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for threats
CREATE OR REPLACE FUNCTION set_threat_display_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('T', 'threat_display_id_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for queries
CREATE OR REPLACE FUNCTION set_query_display_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('Q', 'query_display_id_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for decisions
CREATE OR REPLACE FUNCTION set_decision_display_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('D', 'decision_display_id_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for milestones
CREATE OR REPLACE FUNCTION set_milestone_display_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('M', 'milestone_display_id_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_set_action_display_id ON actions;
CREATE TRIGGER trigger_set_action_display_id
  BEFORE INSERT ON actions
  FOR EACH ROW
  EXECUTE FUNCTION set_action_display_id();

DROP TRIGGER IF EXISTS trigger_set_threat_display_id ON threats;
CREATE TRIGGER trigger_set_threat_display_id
  BEFORE INSERT ON threats
  FOR EACH ROW
  EXECUTE FUNCTION set_threat_display_id();

DROP TRIGGER IF EXISTS trigger_set_query_display_id ON technical_queries;
CREATE TRIGGER trigger_set_query_display_id
  BEFORE INSERT ON technical_queries
  FOR EACH ROW
  EXECUTE FUNCTION set_query_display_id();

DROP TRIGGER IF EXISTS trigger_set_decision_display_id ON decisions;
CREATE TRIGGER trigger_set_decision_display_id
  BEFORE INSERT ON decisions
  FOR EACH ROW
  EXECUTE FUNCTION set_decision_display_id();

DROP TRIGGER IF EXISTS trigger_set_milestone_display_id ON milestones;
CREATE TRIGGER trigger_set_milestone_display_id
  BEFORE INSERT ON milestones
  FOR EACH ROW
  EXECUTE FUNCTION set_milestone_display_id();

-- Backfill existing records with display IDs
-- Actions
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM actions
  WHERE display_id IS NULL
)
UPDATE actions
SET display_id = 'A-' || LPAD(numbered.rn::TEXT, 4, '0')
FROM numbered
WHERE actions.id = numbered.id;

-- Update sequence to continue after existing records
SELECT setval('action_display_id_seq', GREATEST(1, COALESCE((SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) FROM actions WHERE display_id IS NOT NULL), 1)));

-- Threats
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM threats
  WHERE display_id IS NULL
)
UPDATE threats
SET display_id = 'T-' || LPAD(numbered.rn::TEXT, 4, '0')
FROM numbered
WHERE threats.id = numbered.id;

SELECT setval('threat_display_id_seq', GREATEST(1, COALESCE((SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) FROM threats WHERE display_id IS NOT NULL), 1)));

-- Technical Queries
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM technical_queries
  WHERE display_id IS NULL
)
UPDATE technical_queries
SET display_id = 'Q-' || LPAD(numbered.rn::TEXT, 4, '0')
FROM numbered
WHERE technical_queries.id = numbered.id;

SELECT setval('query_display_id_seq', GREATEST(1, COALESCE((SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) FROM technical_queries WHERE display_id IS NOT NULL), 1)));

-- Decisions
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM decisions
  WHERE display_id IS NULL
)
UPDATE decisions
SET display_id = 'D-' || LPAD(numbered.rn::TEXT, 4, '0')
FROM numbered
WHERE decisions.id = numbered.id;

SELECT setval('decision_display_id_seq', GREATEST(1, COALESCE((SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) FROM decisions WHERE display_id IS NOT NULL), 1)));

-- Milestones
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM milestones
  WHERE display_id IS NULL
)
UPDATE milestones
SET display_id = 'M-' || LPAD(numbered.rn::TEXT, 4, '0')
FROM numbered
WHERE milestones.id = numbered.id;

SELECT setval('milestone_display_id_seq', GREATEST(1, COALESCE((SELECT MAX(SUBSTRING(display_id FROM 3)::INTEGER) FROM milestones WHERE display_id IS NOT NULL), 1)));

-- Create indexes for display_id lookups
CREATE INDEX IF NOT EXISTS idx_actions_display_id ON actions(display_id);
CREATE INDEX IF NOT EXISTS idx_threats_display_id ON threats(display_id);
CREATE INDEX IF NOT EXISTS idx_technical_queries_display_id ON technical_queries(display_id);
CREATE INDEX IF NOT EXISTS idx_decisions_display_id ON decisions(display_id);
CREATE INDEX IF NOT EXISTS idx_milestones_display_id ON milestones(display_id);

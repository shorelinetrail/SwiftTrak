-- Add 'none' as a valid option for mitigated_risk
-- This allows threats to be closed with no residual risk

-- Drop the existing constraint
ALTER TABLE threats DROP CONSTRAINT IF EXISTS threats_mitigated_risk_check;

-- Add the new constraint that includes 'none'
ALTER TABLE threats ADD CONSTRAINT threats_mitigated_risk_check
  CHECK (mitigated_risk IN ('none', 'low', 'medium', 'high'));

-- Mark all existing comments as legacy imports (they were all imported)
UPDATE action_updates SET is_legacy_import = TRUE WHERE is_legacy_import IS NULL OR is_legacy_import = FALSE;

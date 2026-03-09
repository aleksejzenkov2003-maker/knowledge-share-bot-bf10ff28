
CREATE INDEX IF NOT EXISTS idx_trademarks_reg_number ON trademarks(registration_number text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_trademarks_inn ON trademarks(right_holder_inn);
CREATE INDEX IF NOT EXISTS idx_trademarks_ogrn ON trademarks(right_holder_ogrn);
CREATE INDEX IF NOT EXISTS idx_trademarks_actual_created ON trademarks(actual, created_at DESC);

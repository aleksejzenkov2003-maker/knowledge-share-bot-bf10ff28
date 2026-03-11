
-- Index for right_holder_address ILIKE search
CREATE INDEX IF NOT EXISTS idx_trademarks_holder_address_trgm ON trademarks USING gin (right_holder_address gin_trgm_ops);

-- Index for right_holder_inn exact match
CREATE INDEX IF NOT EXISTS idx_trademarks_inn ON trademarks (right_holder_inn) WHERE right_holder_inn IS NOT NULL;

-- Index for right_holder_ogrn exact match
CREATE INDEX IF NOT EXISTS idx_trademarks_ogrn ON trademarks (right_holder_ogrn) WHERE right_holder_ogrn IS NOT NULL;

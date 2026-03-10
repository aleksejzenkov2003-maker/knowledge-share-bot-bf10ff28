CREATE INDEX IF NOT EXISTS idx_trademarks_inn_trgm ON trademarks USING gin (right_holder_inn gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trademarks_ogrn_trgm ON trademarks USING gin (right_holder_ogrn gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trademarks_fips_updated ON trademarks ((metadata->>'fips_updated_at')) WHERE metadata->>'fips_updated_at' IS NOT NULL;
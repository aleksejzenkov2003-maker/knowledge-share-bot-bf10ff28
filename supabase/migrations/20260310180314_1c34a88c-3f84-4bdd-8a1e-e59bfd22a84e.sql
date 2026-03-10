
-- Composite index for fips_updated filter + created_at sort
CREATE INDEX idx_trademarks_fips_updated_created ON trademarks (created_at DESC) WHERE fips_updated = true;

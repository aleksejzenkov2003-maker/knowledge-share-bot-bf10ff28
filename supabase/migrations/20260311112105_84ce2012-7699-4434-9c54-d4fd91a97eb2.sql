
CREATE INDEX IF NOT EXISTS idx_trademarks_corr_address_trgm 
  ON trademarks USING gin (correspondence_address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trademarks_well_known_date 
  ON trademarks (well_known_trademark_date) WHERE well_known_trademark_date IS NOT NULL;

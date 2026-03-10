
ALTER TABLE trademarks ADD COLUMN IF NOT EXISTS fips_updated boolean NOT NULL DEFAULT false;

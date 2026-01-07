-- Enable pg_trgm extension for full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN index for trigram similarity search
CREATE INDEX IF NOT EXISTS chunks_content_trgm_idx
ON document_chunks USING gin (content gin_trgm_ops);

-- Add full-text search column (tsvector)
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS content_tsv tsvector
GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS chunks_content_fts_idx
ON document_chunks USING gin (content_tsv);






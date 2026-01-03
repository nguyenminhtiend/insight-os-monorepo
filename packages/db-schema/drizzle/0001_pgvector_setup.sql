-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create HNSW index for vector similarity search
-- Using cosine distance operator (<=>)
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
ON document_chunks
USING hnsw (embedding vector_cosine_ops);



export interface ChunkOptions {
  chunkSize?: number; // Target chunk size in characters
  chunkOverlap?: number; // Overlap between chunks
  minChunkSize?: number; // Minimum chunk size
  separators?: string[]; // Custom separators
}

export interface Chunk {
  content: string;
  index: number;
  metadata: {
    startChar: number;
    endChar: number;
    wordCount: number;
    charCount: number;
    section?: string;
  };
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  chunkSize: 1000,
  chunkOverlap: 200,
  minChunkSize: 100,
  separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ']
};

/**
 * Split text into chunks using recursive character splitting
 * Preserves semantic boundaries (paragraphs > sentences > phrases)
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];

  const splitRecursively = (text: string, separators: string[], startOffset: number): string[] => {
    if (text.length <= opts.chunkSize) {
      return [text];
    }

    const separator = separators[0];
    const remainingSeparators = separators.slice(1);

    if (!separator || remainingSeparators.length === 0) {
      // No more separators, force split
      return forceSplit(text, opts.chunkSize);
    }

    const splits = text.split(separator);
    const results: string[] = [];
    let currentChunk = '';

    for (const split of splits) {
      const candidate = currentChunk ? currentChunk + separator + split : split;

      if (candidate.length <= opts.chunkSize) {
        currentChunk = candidate;
      } else {
        if (currentChunk) {
          results.push(currentChunk);
        }

        if (split.length > opts.chunkSize) {
          // Recursively split with next separator
          const subChunks = splitRecursively(split, remainingSeparators, 0);
          results.push(...subChunks);
          currentChunk = '';
        } else {
          currentChunk = split;
        }
      }
    }

    if (currentChunk) {
      results.push(currentChunk);
    }

    return results;
  };

  const rawChunks = splitRecursively(text, opts.separators, 0);

  // Add overlap and create chunk objects
  let currentOffset = 0;

  for (let i = 0; i < rawChunks.length; i++) {
    let chunkContent = rawChunks[i];

    // Add overlap from previous chunk
    if (i > 0 && opts.chunkOverlap > 0) {
      const previousChunk = rawChunks[i - 1];
      const overlapText = previousChunk.slice(-opts.chunkOverlap);
      chunkContent = overlapText + chunkContent;
    }

    // Skip chunks that are too small
    if (chunkContent.length < opts.minChunkSize) {
      continue;
    }

    const chunkStartChar = Math.max(0, currentOffset - (i > 0 ? opts.chunkOverlap : 0));

    chunks.push({
      content: chunkContent.trim(),
      index: chunks.length,
      metadata: {
        startChar: chunkStartChar,
        endChar: chunkStartChar + chunkContent.length,
        wordCount: chunkContent.split(/\s+/).length,
        charCount: chunkContent.length
      }
    });

    currentOffset += rawChunks[i].length;
  }

  return chunks;
}

/**
 * Force split text at exact positions
 */
function forceSplit(text: string, size: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    result.push(text.slice(i, i + size));
  }
  return result;
}

/**
 * Chunk by sentences (semantic chunking)
 */
export function chunkBySentences(
  text: string,
  options: { sentencesPerChunk?: number; overlap?: number } = {}
): Chunk[] {
  const { sentencesPerChunk = 5, overlap = 1 } = options;

  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: Chunk[] = [];

  for (let i = 0; i < sentences.length; i += sentencesPerChunk - overlap) {
    const chunkSentences = sentences.slice(i, i + sentencesPerChunk);
    const content = chunkSentences.join(' ').trim();

    if (content.length > 0) {
      chunks.push({
        content,
        index: chunks.length,
        metadata: {
          startChar: 0, // Would need to calculate
          endChar: content.length,
          wordCount: content.split(/\s+/).length,
          charCount: content.length
        }
      });
    }
  }

  return chunks;
}

/**
 * Chunk markdown by headers
 */
export function chunkMarkdown(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  const sections = text.split(/(?=^#{1,3}\s)/m);

  for (const section of sections) {
    if (section.trim().length === 0) continue;

    // Extract header for context
    const headerMatch = section.match(/^(#{1,3})\s+(.+)/);
    const header = headerMatch ? headerMatch[2] : undefined;

    chunks.push({
      content: section.trim(),
      index: chunks.length,
      metadata: {
        startChar: 0,
        endChar: section.length,
        wordCount: section.split(/\s+/).length,
        charCount: section.length,
        ...(header && { section: header })
      }
    });
  }

  return chunks;
}

/**
 * Estimate token count (rough approximation)
 * OpenAI: ~4 chars per token for English
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Smart chunking based on content type
 */
export function smartChunk(
  text: string,
  contentType: 'plain' | 'markdown' | 'code' = 'plain',
  options: ChunkOptions = {}
): Chunk[] {
  switch (contentType) {
    case 'markdown':
      return chunkMarkdown(text);
    case 'code':
      // For code, use function/class boundaries if possible
      return chunkText(text, {
        ...options,
        separators: ['\n\n', '\nfunction ', '\nclass ', '\nexport ', '\n']
      });
    default:
      return chunkText(text, options);
  }
}



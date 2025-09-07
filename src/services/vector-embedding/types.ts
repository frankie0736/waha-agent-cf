export interface EmbeddingRequest {
  texts: string[];
  model?: string;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: {
    totalTokens: number;
  };
}

export interface VectorMetadata {
  chunkId: string;
  kbId: string;
  docId: string;
  chunkIndex: number;
  text: string;
  createdAt: number;
}

export interface VectorSearchOptions {
  topK?: number;
  threshold?: number;
  filter?: {
    kbId?: string;
    docId?: string;
  };
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

export interface EmbeddingJob {
  id: string;
  chunkId: string;
  kbId: string;
  docId: string;
  chunkIndex: number;
  text: string;
  retryCount: number;
  createdAt: number;
}

export interface VectorizeConfig {
  dimensions: number;
  model: string;
  maxRetries: number;
  batchSize: number;
}

export interface ProcessingResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors: string[];
}
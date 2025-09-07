import { EmbeddingService } from './embedding-service';
import { VectorizeService } from './vectorize-service';
import type { 
  VectorMetadata, 
  VectorSearchOptions, 
  VectorSearchResult, 
  EmbeddingJob,
  ProcessingResult 
} from './types';
import type { Env } from '../../types';
import type { D1Database } from '@cloudflare/workers-types';

export class VectorEmbeddingManager {
  private readonly embeddingService: EmbeddingService;
  private readonly vectorizeService: VectorizeService;
  private readonly db: D1Database;
  private readonly embeddingQueue: Queue | undefined;

  constructor(env: Env) {
    if (!env.AIHUBMIX_API_KEY) {
      throw new Error('AIHUBMIX_API_KEY environment variable is required');
    }

    if (!env.VECTORIZE) {
      throw new Error('VECTORIZE index binding is required');
    }

    this.embeddingService = new EmbeddingService(env.AIHUBMIX_API_KEY);
    this.vectorizeService = new VectorizeService(env.VECTORIZE);
    this.db = env.DB;
    this.embeddingQueue = env.QUEUE_EMBED;
  }

  async processChunksForVectorization(
    chunks: Array<{
      id: string;
      kbId: string;
      docId: string;
      chunkIndex: number;
      text: string;
      createdAt: Date;
    }>
  ): Promise<ProcessingResult> {
    const results: ProcessingResult = {
      success: true,
      processedCount: 0,
      failedCount: 0,
      errors: []
    };

    if (chunks.length === 0) {
      return results;
    }

    try {
      const texts = chunks.map(chunk => chunk.text);
      const embeddings = await this.embeddingService.createEmbeddings(texts);

      const vectors = chunks.map((chunk, index) => {
        const embedding = embeddings[index];
        if (!embedding) {
          throw new Error(`Missing embedding for chunk at index ${index}`);
        }
        return {
          id: this.vectorizeService.generateVectorId(chunk.id),
          values: embedding,
          metadata: {
            chunkId: chunk.id,
            kbId: chunk.kbId,
            docId: chunk.docId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            createdAt: chunk.createdAt.getTime()
          } as VectorMetadata
        };
      });

      const vectorResult = await this.vectorizeService.insertVectors(vectors);

      if (vectorResult.success) {
        await this.updateChunksWithVectorIds(chunks, vectors);
        results.processedCount = vectorResult.processedCount;
      } else {
        results.success = false;
        results.failedCount = vectorResult.failedCount;
        results.errors.push(...vectorResult.errors);
      }

      return results;
    } catch (error) {
      results.success = false;
      results.failedCount = chunks.length;
      results.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return results;
    }
  }

  async queueChunksForEmbedding(
    chunks: Array<{
      id: string;
      kbId: string;
      docId: string;
      chunkIndex: number;
      text: string;
    }>
  ): Promise<void> {
    if (!this.embeddingQueue) {
      throw new Error('Embedding queue not available - processing synchronously');
    }

    const jobs: EmbeddingJob[] = chunks.map(chunk => ({
      id: `job_${chunk.id}`,
      chunkId: chunk.id,
      kbId: chunk.kbId,
      docId: chunk.docId,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      retryCount: 0,
      createdAt: Date.now()
    }));

    for (const job of jobs) {
      await this.embeddingQueue.send(job);
    }
  }

  async searchSimilarChunks(
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    try {
      const queryEmbedding = await this.embeddingService.createSingleEmbedding(query);
      
      if (queryEmbedding.length === 0) {
        return [];
      }

      return await this.vectorizeService.searchVectors(queryEmbedding, options);
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  async deleteVectorsForDocument(docId: string): Promise<ProcessingResult> {
    return await this.vectorizeService.deleteByFilter({ docId });
  }

  async deleteVectorsForKnowledgeBase(kbId: string): Promise<ProcessingResult> {
    return await this.vectorizeService.deleteByFilter({ kbId });
  }

  async getIndexStats(): Promise<{
    vectorCount: number;
    dimensions: number;
    model: string;
  }> {
    const stats = await this.vectorizeService.getIndexStats();
    return {
      ...stats,
      model: this.embeddingService.getModel()
    };
  }

  private async updateChunksWithVectorIds(
    chunks: Array<{ id: string }>,
    vectors: Array<{ id: string; metadata: VectorMetadata }>
  ): Promise<void> {
    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vector = vectors[i];
        if (!chunk || !vector) {
          continue;
        }
        const vectorId = vector.id;

        await this.db
          .prepare('UPDATE kb_chunks SET vector_id = ? WHERE id = ?')
          .bind(vectorId, chunk.id)
          .run();
      }
    } catch (error) {
      console.error('Failed to update chunks with vector IDs:', error);
      throw error;
    }
  }

  async processEmbeddingJob(job: EmbeddingJob): Promise<boolean> {
    try {
      const chunk = {
        id: job.chunkId,
        kbId: job.kbId,
        docId: job.docId,
        chunkIndex: job.chunkIndex,
        text: job.text,
        createdAt: new Date(job.createdAt)
      };

      const result = await this.processChunksForVectorization([chunk]);
      return result.success;
    } catch (error) {
      console.error('Failed to process embedding job:', error);
      return false;
    }
  }

  async reprocessFailedChunks(kbId?: string, docId?: string): Promise<ProcessingResult> {
    try {
      let query = `
        SELECT id, kb_id as kbId, doc_id as docId, chunk_index as chunkIndex, text, created_at as createdAt
        FROM kb_chunks 
        WHERE vector_id IS NULL
      `;
      const params: any[] = [];

      if (kbId) {
        query += ' AND kb_id = ?';
        params.push(kbId);
      }

      if (docId) {
        query += ' AND doc_id = ?';
        params.push(docId);
      }

      query += ' ORDER BY created_at ASC LIMIT 100';

      const stmt = params.length > 0 
        ? this.db.prepare(query).bind(...params)
        : this.db.prepare(query);

      const result = await stmt.all();

      if (!result.results || result.results.length === 0) {
        return {
          success: true,
          processedCount: 0,
          failedCount: 0,
          errors: []
        };
      }

      const chunks = result.results.map((row: any) => ({
        id: row.id,
        kbId: row.kbId,
        docId: row.docId,
        chunkIndex: row.chunkIndex,
        text: row.text,
        createdAt: new Date(row.createdAt)
      }));

      return await this.processChunksForVectorization(chunks);
    } catch (error) {
      return {
        success: false,
        processedCount: 0,
        failedCount: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }
}
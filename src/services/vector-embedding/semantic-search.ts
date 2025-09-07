import { VectorEmbeddingManager } from './vector-embedding-manager';
import type { VectorSearchResult, VectorSearchOptions } from './types';
import type { Env } from '../../types';
import type { D1Database } from '@cloudflare/workers-types';

export interface SemanticSearchResult {
  id: string;
  docId: string;
  kbId: string;
  chunkIndex: number;
  text: string;
  score: number;
  document?: {
    filename: string;
    filetype: string;
  };
  knowledgeBase?: {
    name: string;
  };
}

export interface SemanticSearchOptions {
  kbId?: string;
  docId?: string;
  limit?: number;
  threshold?: number;
  includeDocument?: boolean;
  includeKnowledgeBase?: boolean;
}

export class SemanticSearchService {
  private readonly vectorManager: VectorEmbeddingManager;
  private readonly db: D1Database;

  constructor(env: Env) {
    this.vectorManager = new VectorEmbeddingManager(env);
    this.db = env.DB;
  }

  async search(
    query: string, 
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    const {
      kbId,
      docId,
      limit = 10,
      threshold = 0.7,
      includeDocument = false,
      includeKnowledgeBase = false
    } = options;

    if (!query.trim()) {
      return [];
    }

    try {
      const vectorSearchOptions: VectorSearchOptions = {
        topK: Math.min(limit * 2, 50),
        threshold,
        filter: {}
      };

      if (kbId) {
        vectorSearchOptions.filter!.kbId = kbId;
      }

      if (docId) {
        vectorSearchOptions.filter!.docId = docId;
      }

      const vectorResults = await this.vectorManager.searchSimilarChunks(
        query,
        vectorSearchOptions
      );

      if (vectorResults.length === 0) {
        return [];
      }

      const chunkIds = vectorResults.map(result => result.metadata.chunkId);
      const chunks = await this.getChunkDetails(chunkIds);

      const results: SemanticSearchResult[] = [];

      for (const vectorResult of vectorResults) {
        const chunk = chunks.find(c => c.id === vectorResult.metadata.chunkId);
        if (!chunk) continue;

        const result: SemanticSearchResult = {
          id: chunk.id,
          docId: chunk.docId,
          kbId: chunk.kbId,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          score: vectorResult.score
        };

        results.push(result);

        if (results.length >= limit) {
          break;
        }
      }

      if (includeDocument || includeKnowledgeBase) {
        await this.enrichResultsWithMetadata(results, includeDocument, includeKnowledgeBase);
      }

      return results.sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error('Semantic search failed:', error);
      return [];
    }
  }

  async searchWithinKnowledgeBase(
    query: string,
    kbId: string,
    options: Omit<SemanticSearchOptions, 'kbId'> = {}
  ): Promise<SemanticSearchResult[]> {
    return this.search(query, { ...options, kbId });
  }

  async searchWithinDocument(
    query: string,
    docId: string,
    options: Omit<SemanticSearchOptions, 'docId'> = {}
  ): Promise<SemanticSearchResult[]> {
    return this.search(query, { ...options, docId });
  }

  async findSimilarChunks(
    chunkId: string,
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    try {
      const chunk = await this.getChunkById(chunkId);
      if (!chunk) {
        return [];
      }

      return this.search(chunk.text, {
        ...options,
        kbId: options.kbId || chunk.kbId
      });
    } catch (error) {
      console.error('Failed to find similar chunks:', error);
      return [];
    }
  }

  async getRecommendations(
    kbId: string,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    try {
      const recentChunks = await this.getRecentChunks(kbId, 20);
      
      if (recentChunks.length === 0) {
        return [];
      }

      const randomChunk = recentChunks[Math.floor(Math.random() * recentChunks.length)];
      if (!randomChunk) {
        return [];
      }
      
      return this.search(randomChunk.text, {
        kbId,
        limit,
        threshold: 0.6,
        includeDocument: true
      });
    } catch (error) {
      console.error('Failed to get recommendations:', error);
      return [];
    }
  }

  private async getChunkDetails(chunkIds: string[]): Promise<Array<{
    id: string;
    docId: string;
    kbId: string;
    chunkIndex: number;
    text: string;
  }>> {
    if (chunkIds.length === 0) return [];

    try {
      const placeholders = chunkIds.map(() => '?').join(',');
      const query = `
        SELECT id, doc_id as docId, kb_id as kbId, chunk_index as chunkIndex, text
        FROM kb_chunks
        WHERE id IN (${placeholders})
      `;

      const result = await this.db.prepare(query).bind(...chunkIds).all();

      return (result.results || []) as Array<{
        id: string;
        docId: string;
        kbId: string;
        chunkIndex: number;
        text: string;
      }>;
    } catch (error) {
      console.error('Failed to get chunk details:', error);
      return [];
    }
  }

  private async getChunkById(chunkId: string): Promise<{
    id: string;
    docId: string;
    kbId: string;
    chunkIndex: number;
    text: string;
  } | null> {
    try {
      const result = await this.db
        .prepare(`
          SELECT id, doc_id as docId, kb_id as kbId, chunk_index as chunkIndex, text
          FROM kb_chunks
          WHERE id = ?
        `)
        .bind(chunkId)
        .first();

      return result as any || null;
    } catch (error) {
      console.error('Failed to get chunk by ID:', error);
      return null;
    }
  }

  private async getRecentChunks(kbId: string, limit: number = 20): Promise<Array<{
    id: string;
    text: string;
  }>> {
    try {
      const result = await this.db
        .prepare(`
          SELECT id, text
          FROM kb_chunks
          WHERE kb_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `)
        .bind(kbId, limit)
        .all();

      return (result.results || []) as Array<{
        id: string;
        text: string;
      }>;
    } catch (error) {
      console.error('Failed to get recent chunks:', error);
      return [];
    }
  }

  private async enrichResultsWithMetadata(
    results: SemanticSearchResult[],
    includeDocument: boolean,
    includeKnowledgeBase: boolean
  ): Promise<void> {
    if (results.length === 0) return;

    try {
      if (includeDocument) {
        const docIds = [...new Set(results.map(r => r.docId))];
        const documents = await this.getDocuments(docIds);
        
        for (const result of results) {
          const doc = documents.find(d => d.id === result.docId);
          if (doc) {
            result.document = {
              filename: doc.filename,
              filetype: doc.filetype
            };
          }
        }
      }

      if (includeKnowledgeBase) {
        const kbIds = [...new Set(results.map(r => r.kbId))];
        const knowledgeBases = await this.getKnowledgeBases(kbIds);
        
        for (const result of results) {
          const kb = knowledgeBases.find(k => k.id === result.kbId);
          if (kb) {
            result.knowledgeBase = {
              name: kb.name
            };
          }
        }
      }
    } catch (error) {
      console.error('Failed to enrich results with metadata:', error);
    }
  }

  private async getDocuments(docIds: string[]): Promise<Array<{
    id: string;
    filename: string;
    filetype: string;
  }>> {
    if (docIds.length === 0) return [];

    try {
      const placeholders = docIds.map(() => '?').join(',');
      const result = await this.db
        .prepare(`
          SELECT id, filename, filetype
          FROM kb_documents
          WHERE id IN (${placeholders})
        `)
        .bind(...docIds)
        .all();

      return (result.results || []) as Array<{
        id: string;
        filename: string;
        filetype: string;
      }>;
    } catch (error) {
      console.error('Failed to get documents:', error);
      return [];
    }
  }

  private async getKnowledgeBases(kbIds: string[]): Promise<Array<{
    id: string;
    name: string;
  }>> {
    if (kbIds.length === 0) return [];

    try {
      const placeholders = kbIds.map(() => '?').join(',');
      const result = await this.db
        .prepare(`
          SELECT id, name
          FROM kb_spaces
          WHERE id IN (${placeholders})
        `)
        .bind(...kbIds)
        .all();

      return (result.results || []) as Array<{
        id: string;
        name: string;
      }>;
    } catch (error) {
      console.error('Failed to get knowledge bases:', error);
      return [];
    }
  }
}
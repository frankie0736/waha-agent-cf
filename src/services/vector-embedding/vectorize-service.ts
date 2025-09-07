import type { 
  VectorMetadata, 
  VectorSearchOptions, 
  VectorSearchResult,
  ProcessingResult 
} from './types';
import type { VectorizeQueryOptions } from '@cloudflare/workers-types';

export class VectorizeService {
  private readonly vectorIndex: VectorizeIndex;

  constructor(vectorIndex: VectorizeIndex) {
    this.vectorIndex = vectorIndex;
  }

  async insertVectors(
    vectors: {
      id: string;
      values: number[];
      metadata: VectorMetadata;
    }[]
  ): Promise<ProcessingResult> {
    try {
      if (vectors.length === 0) {
        return {
          success: true,
          processedCount: 0,
          failedCount: 0,
          errors: []
        };
      }

      const vectorizeVectors = vectors.map(vector => ({
        id: vector.id,
        values: vector.values,
        metadata: vector.metadata as Record<string, any>
      }));

      const result = await this.vectorIndex.insert(vectorizeVectors);

      return {
        success: true,
        processedCount: result.count || vectors.length,
        failedCount: 0,
        errors: []
      };
    } catch (error) {
      return {
        success: false,
        processedCount: 0,
        failedCount: vectors.length,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async searchVectors(
    queryVector: number[],
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    try {
      const { topK = 10, threshold = 0.7, filter } = options;

      let vectorizeFilter: Record<string, any> | undefined;
      if (filter) {
        vectorizeFilter = {};
        if (filter.kbId) {
          vectorizeFilter.kbId = filter.kbId;
        }
        if (filter.docId) {
          vectorizeFilter.docId = filter.docId;
        }
      }

      const queryOptions: VectorizeQueryOptions = {
        topK,
        returnMetadata: true,
        returnValues: false
      };
      if (vectorizeFilter && Object.keys(vectorizeFilter).length > 0) {
        queryOptions.filter = vectorizeFilter;
      }
      
      const searchResult = await this.vectorIndex.query(queryVector, queryOptions);

      return searchResult.matches
        .filter(match => match.score >= threshold)
        .map(match => ({
          id: match.id,
          score: match.score,
          metadata: match.metadata as unknown as VectorMetadata
        }));
    } catch (error) {
      console.error('Vector search failed:', error);
      return [];
    }
  }

  async deleteVectors(ids: string[]): Promise<ProcessingResult> {
    try {
      if (ids.length === 0) {
        return {
          success: true,
          processedCount: 0,
          failedCount: 0,
          errors: []
        };
      }

      await this.vectorIndex.deleteByIds(ids);

      return {
        success: true,
        processedCount: ids.length,
        failedCount: 0,
        errors: []
      };
    } catch (error) {
      return {
        success: false,
        processedCount: 0,
        failedCount: ids.length,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async deleteByFilter(filter: { kbId?: string; docId?: string }): Promise<ProcessingResult> {
    try {
      // Vectorize doesn't support deleteByFilter, so we need to query first then delete
      const vectorIds: string[] = [];
      
      // Query to find matching vector IDs with a large topK to get all matching vectors
      const queryOptions: VectorizeQueryOptions = {
        topK: 10000, // Large number to get all matches
        returnMetadata: true,
        returnValues: false
      };

      if (filter.kbId || filter.docId) {
        const filterObj: Record<string, any> = {};
        if (filter.kbId) filterObj.kbId = filter.kbId;
        if (filter.docId) filterObj.docId = filter.docId;
        queryOptions.filter = filterObj;
      } else {
        throw new Error('At least one filter parameter is required');
      }

      // We need to create a dummy vector to search with - using zero vector
      const dummyVector = new Array(1536).fill(0);
      const searchResult = await this.vectorIndex.query(dummyVector, queryOptions);
      
      const idsToDelete = searchResult.matches.map(match => match.id);
      
      if (idsToDelete.length === 0) {
        return {
          success: true,
          processedCount: 0,
          failedCount: 0,
          errors: []
        };
      }

      // Delete the found vectors
      return await this.deleteVectors(idsToDelete);
    } catch (error) {
      return {
        success: false,
        processedCount: 0,
        failedCount: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async getVectorById(id: string): Promise<{
    id: string;
    values: number[];
    metadata: VectorMetadata;
  } | null> {
    try {
      const result = await this.vectorIndex.getByIds([id]);
      
      if (result.length === 0) {
        return null;
      }

      const vector = result[0];
      if (!vector) {
        return null;
      }
      return {
        id: vector.id,
        values: Array.isArray(vector.values) ? vector.values : Array.from(vector.values),
        metadata: vector.metadata as unknown as VectorMetadata
      };
    } catch (error) {
      console.error('Failed to get vector by ID:', error);
      return null;
    }
  }

  async getIndexStats(): Promise<{
    vectorCount: number;
    dimensions: number;
  }> {
    try {
      const info = await this.vectorIndex.describe();
      return {
        vectorCount: info.vectorsCount || 0,
        dimensions: (info.config as any)?.dimensions || 1536
      };
    } catch (error) {
      console.error('Failed to get index stats:', error);
      return {
        vectorCount: 0,
        dimensions: 1536
      };
    }
  }

  generateVectorId(chunkId: string): string {
    return `vec_${chunkId}`;
  }

  validateVector(values: number[], expectedDimensions: number = 1536): boolean {
    if (!Array.isArray(values)) return false;
    if (values.length !== expectedDimensions) return false;
    return values.every(value => typeof value === 'number' && !isNaN(value));
  }
}
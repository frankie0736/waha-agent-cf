import type { EmbeddingRequest, EmbeddingResponse, VectorizeConfig } from './types';

export class EmbeddingService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly config: VectorizeConfig;

  constructor(apiKey: string, config: Partial<VectorizeConfig> = {}) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://aihubmix.com/api/v1';
    this.config = {
      dimensions: 1536,
      model: 'text-embedding-ada-002',
      maxRetries: 3,
      batchSize: 100,
      ...config
    };
  }

  async createEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const batches = this.createBatches(texts, this.config.batchSize);
    const allEmbeddings: number[][] = [];

    for (const batch of batches) {
      const embeddings = await this.processBatch(batch);
      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  }

  async createSingleEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.createEmbeddings([text]);
    return embeddings[0] || [];
  }

  private createBatches(texts: string[], batchSize: number): string[][] {
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }
    return batches;
  }

  private async processBatch(texts: string[]): Promise<number[][]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await this.callEmbeddingAPI({
          texts,
          model: this.config.model
        });

        return response.embeddings;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < this.config.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed to create embeddings after ${this.config.maxRetries} attempts: ${lastError?.message}`);
  }

  private async callEmbeddingAPI(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'WA-Agent/1.0'
      },
      body: JSON.stringify({
        model: request.model || this.config.model,
        input: request.texts
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`AIHubMix API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response format from embedding API');
    }

    const embeddings = data.data.map((item: any) => {
      if (!item.embedding || !Array.isArray(item.embedding)) {
        throw new Error('Invalid embedding format in API response');
      }
      return item.embedding;
    });

    return {
      embeddings,
      model: data.model || request.model || this.config.model,
      usage: {
        totalTokens: data.usage?.total_tokens || 0
      }
    };
  }

  validateEmbedding(embedding: number[]): boolean {
    if (!Array.isArray(embedding)) return false;
    if (embedding.length !== this.config.dimensions) return false;
    return embedding.every(value => typeof value === 'number' && !isNaN(value));
  }

  getDimensions(): number {
    return this.config.dimensions;
  }

  getModel(): string {
    return this.config.model;
  }
}
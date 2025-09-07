import type {
  AIHubMixConfig,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ModelInfo,
  ModelsResponse,
  ApiKeyValidationResult,
  RequestMetrics,
  RateLimiter
} from './types';
import {
  AIHubMixError,
  RateLimitError,
  AuthenticationError
} from './types';
import { KeyEncryptionService } from './key-encryption';
import { createRateLimiter } from './rate-limiter';

/**
 * Comprehensive AIHubMix API Client with encryption, rate limiting, and error handling
 */
export class AIHubMixClient {
  private readonly config: AIHubMixConfig;
  private readonly keyEncryption?: KeyEncryptionService;
  private readonly rateLimiter: RateLimiter;
  private readonly requestMetrics: RequestMetrics[] = [];

  constructor(
    private readonly apiKey: string,
    options: {
      encryptionSecret?: string;
      kv?: KVNamespace;
      config?: Partial<AIHubMixConfig>;
    } = {}
  ) {
    this.config = {
      baseUrl: 'https://aihubmix.com/api/v1',
      maxRetries: 3,
      timeoutMs: 30000,
      rateLimitPerMinute: 60,
      defaultModel: 'gpt-3.5-turbo',
      ...options.config
    };

    // Initialize encryption service if secret provided
    if (options.encryptionSecret) {
      this.keyEncryption = new KeyEncryptionService(options.encryptionSecret);
    }

    // Initialize rate limiter
    this.rateLimiter = createRateLimiter(options.kv, this.config.rateLimitPerMinute);
  }

  /**
   * Chat Completion API - supports GPT, Claude, Gemini, etc.
   */
  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      // Validate request
      this.validateChatRequest(request);

      // Check rate limits
      await this.checkRateLimit('chat');

      // Make API request with retries
      const response = await this.makeRequest<ChatCompletionResponse>(
        'POST',
        '/chat/completions',
        {
          model: request.model || this.config.defaultModel,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.max_tokens ?? 1000,
          top_p: request.top_p,
          frequency_penalty: request.frequency_penalty,
          presence_penalty: request.presence_penalty,
          stream: request.stream ?? false
        }
      );

      // Record metrics
      this.recordMetrics({
        requestId,
        timestamp: startTime,
        method: 'POST',
        endpoint: '/chat/completions',
        model: request.model,
        tokens: response.usage?.total_tokens,
        duration: Date.now() - startTime,
        success: true
      });

      return response;
    } catch (error) {
      // Record error metrics
      this.recordMetrics({
        requestId,
        timestamp: startTime,
        method: 'POST',
        endpoint: '/chat/completions',
        model: request.model,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  /**
   * Embeddings API - supports text-embedding-ada-002 and other models
   */
  async createEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      // Validate request
      this.validateEmbeddingRequest(request);

      // Check rate limits
      await this.checkRateLimit('embeddings');

      // Handle batch processing for multiple inputs
      const inputs = Array.isArray(request.input) ? request.input : [request.input];
      
      if (inputs.length > 100) {
        throw new AIHubMixError('Too many inputs. Maximum 100 texts per request.');
      }

      // Make API request
      const response = await this.makeRequest<EmbeddingResponse>(
        'POST',
        '/embeddings',
        {
          model: request.model || 'text-embedding-ada-002',
          input: inputs,
          encoding_format: request.encoding_format || 'float',
          dimensions: request.dimensions
        }
      );

      // Record metrics
      this.recordMetrics({
        requestId,
        timestamp: startTime,
        method: 'POST',
        endpoint: '/embeddings',
        model: request.model,
        tokens: response.usage?.total_tokens,
        duration: Date.now() - startTime,
        success: true
      });

      return response;
    } catch (error) {
      // Record error metrics
      this.recordMetrics({
        requestId,
        timestamp: startTime,
        method: 'POST',
        endpoint: '/embeddings',
        model: request.model,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<ModelsResponse> {
    return await this.makeRequest<ModelsResponse>('GET', '/models');
  }

  /**
   * Validate API key and get user information
   */
  async validateApiKey(): Promise<ApiKeyValidationResult> {
    try {
      // Try a simple API call to validate the key
      const response = await this.makeRequest<{ data: { id: string; email?: string } }>(
        'GET', 
        '/user'
      );

      return {
        valid: true,
        userInfo: {
          id: response.data.id,
          ...(response.data.email && { email: response.data.email })
        }
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return {
          valid: false,
          error: 'Invalid API key'
        };
      }

      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }

  /**
   * Get request metrics for monitoring
   */
  getMetrics(): RequestMetrics[] {
    return [...this.requestMetrics];
  }

  /**
   * Clear metrics history
   */
  clearMetrics(): void {
    this.requestMetrics.length = 0;
  }

  /**
   * Get client configuration
   */
  getConfig(): AIHubMixConfig {
    return { ...this.config };
  }

  // Private methods

  private async makeRequest<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const url = `${this.config.baseUrl}${endpoint}`;
        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'User-Agent': 'WA-Agent/1.0'
          },
          signal: AbortSignal.timeout(this.config.timeoutMs)
        };
        
        if (body) {
          fetchOptions.body = JSON.stringify(body);
        }
        
        const response = await fetch(url, fetchOptions);

        // Record request for rate limiting
        await this.rateLimiter.recordRequest(this.getRateLimitKey(endpoint));

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          
          // Handle specific error types
          if (response.status === 401) {
            throw new AuthenticationError('Invalid API key or authentication failed');
          }
          
          if (response.status === 429) {
            const retryAfter = this.parseRetryAfter(response.headers.get('retry-after'));
            throw new RateLimitError(`Rate limit exceeded`, retryAfter);
          }

          throw new AIHubMixError(
            `API request failed: ${errorText}`,
            response.status,
            this.parseErrorCode(errorText)
          );
        }

        const data = await response.json();
        return data as T;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Don't retry on authentication errors or rate limit errors
        if (error instanceof AuthenticationError || error instanceof RateLimitError) {
          throw error;
        }

        // Exponential backoff for other errors
        if (attempt < this.config.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new AIHubMixError(
      `Request failed after ${this.config.maxRetries} attempts: ${lastError?.message}`,
      undefined,
      'max_retries_exceeded'
    );
  }

  private async checkRateLimit(operation: string): Promise<void> {
    const key = this.getRateLimitKey(operation);
    const result = await this.rateLimiter.checkLimit(key);
    
    if (!result.allowed) {
      throw new RateLimitError(
        `Rate limit exceeded for ${operation}`,
        result.retryAfter
      );
    }
  }

  private getRateLimitKey(operation: string): string {
    // Use a hash of the API key to avoid storing the actual key
    return `${operation}_${this.hashApiKey()}`;
  }

  private hashApiKey(): string {
    // Simple hash for rate limiting key (not cryptographic)
    let hash = 0;
    for (let i = 0; i < this.apiKey.length; i++) {
      const char = this.apiKey.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private validateChatRequest(request: ChatCompletionRequest): void {
    if (!request.messages || request.messages.length === 0) {
      throw new AIHubMixError('Messages array is required and cannot be empty');
    }

    for (const message of request.messages) {
      if (!message.role || !message.content) {
        throw new AIHubMixError('Each message must have role and content');
      }
    }

    if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 2)) {
      throw new AIHubMixError('Temperature must be between 0 and 2');
    }

    if (request.max_tokens !== undefined && request.max_tokens < 1) {
      throw new AIHubMixError('max_tokens must be at least 1');
    }
  }

  private validateEmbeddingRequest(request: EmbeddingRequest): void {
    if (!request.input || (Array.isArray(request.input) && request.input.length === 0)) {
      throw new AIHubMixError('Input is required and cannot be empty');
    }

    if (request.dimensions !== undefined && request.dimensions < 1) {
      throw new AIHubMixError('Dimensions must be at least 1');
    }
  }

  private parseRetryAfter(retryAfter: string | null): number | undefined {
    if (!retryAfter) return undefined;
    
    const seconds = parseInt(retryAfter, 10);
    return isNaN(seconds) ? undefined : seconds;
  }

  private parseErrorCode(errorText: string): string | undefined {
    try {
      const parsed = JSON.parse(errorText);
      return parsed.error?.code || parsed.code;
    } catch {
      return undefined;
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private recordMetrics(metrics: RequestMetrics): void {
    this.requestMetrics.push(metrics);
    
    // Keep only last 100 metrics to avoid memory issues
    if (this.requestMetrics.length > 100) {
      this.requestMetrics.shift();
    }
  }
}
// AIHubMix API Types and Interfaces

export interface AIHubMixConfig {
  baseUrl: string;
  maxRetries: number;
  timeoutMs: number;
  rateLimitPerMinute: number;
  defaultModel: string;
}

// Chat Completion Types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Embedding Types (extending from existing)
export interface EmbeddingRequest {
  model: string;
  input: string | string[];
  encoding_format?: string;
  dimensions?: number;
}

export interface EmbeddingResponse {
  object: string;
  data: {
    object: string;
    index: number;
    embedding: number[];
  }[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// Model Information
export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  permission: Record<string, unknown>[];
  root: string;
  parent: string | null;
  max_tokens?: number;
  type: 'chat' | 'embedding' | 'completion';
  description?: string;
}

export interface ModelsResponse {
  object: string;
  data: ModelInfo[];
}

// API Key Management
export interface EncryptedApiKey {
  encryptedKey: string;
  iv: string;
  tag: string;
  createdAt: number;
  userId: string;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  error?: string;
  userInfo?: {
    id: string;
    email?: string;
    plan?: string;
    usage?: {
      total_tokens: number;
      limit_tokens: number;
    };
  };
}

// Error Types
export class AIHubMixError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AIHubMixError';
  }
}

export class RateLimitError extends AIHubMixError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 429, 'rate_limit_exceeded');
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends AIHubMixError {
  constructor(message: string = 'Invalid API key') {
    super(message, 401, 'authentication_failed');
    this.name = 'AuthenticationError';
  }
}

// Request/Response Tracking
export interface RequestMetrics {
  requestId: string;
  timestamp: number;
  method: string;
  endpoint: string;
  model?: string;
  tokens?: number;
  duration: number;
  success: boolean;
  error?: string;
}

// Rate Limiting
export interface RateLimiter {
  checkLimit(key: string): Promise<{ allowed: boolean; retryAfter?: number }>;
  recordRequest(key: string): Promise<void>;
}
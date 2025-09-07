/**
 * Queue Message Type Definitions
 * 
 * Defines the structure of messages flowing through the
 * three-stage processing pipeline: retrieve → infer → reply
 */

/**
 * Message sent to the retrieve queue
 * From: ChatSessionDO (after merging)
 * To: q_retrieve processor
 */
export interface RetrieveQueueMessage {
  chatKey: string;           // Format: userId:waAccountId:whatsappChatId
  mergedText: string;        // The merged user message
  timestamp: number;         // Message timestamp
  turn: number;              // Conversation turn number
  sessionId: string;         // WhatsApp session ID
  agentId?: string;          // Agent ID for this conversation
  metadata?: {
    userId: string;
    waAccountId: string;
    whatsappChatId: string;
    messageCount: number;    // Number of messages merged
  };
}

/**
 * Message sent to the infer queue
 * From: q_retrieve processor
 * To: q_infer processor
 */
export interface InferQueueMessage {
  chatKey: string;
  userMessage: string;       // Original user message
  context: Array<{           // Retrieved knowledge chunks
    text: string;
    score: number;
    metadata?: {
      kbId: string;
      docId: string;
      chunkIndex: number;
    };
  }>;
  agentConfig: {             // Agent configuration
    id: string;
    name: string;
    systemPrompt: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  chatHistory: Array<{       // Recent conversation history
    role: 'user' | 'assistant';
    content: string;
  }>;
  timestamp: number;
  turn: number;
  sessionId: string;
}

/**
 * Message sent to the reply queue
 * From: q_infer processor
 * To: q_reply processor
 */
export interface ReplyQueueMessage {
  chatKey: string;
  aiResponse: string;        // AI-generated response
  userMessage: string;       // Original user message (for context)
  timestamp: number;
  turn: number;
  sessionId: string;
  waAccountId: string;
  whatsappChatId: string;
  metadata?: {
    inferenceTime: number;   // Time taken for AI inference (ms)
    tokensUsed: number;      // Tokens consumed
    model: string;           // Model used
  };
}

/**
 * Common error structure for DLQ
 */
export interface QueueErrorMessage {
  originalMessage: unknown;
  error: {
    message: string;
    stack?: string;
    code?: string;
  };
  queue: 'retrieve' | 'infer' | 'reply';
  timestamp: number;
  retryCount: number;
}

/**
 * Job status for tracking in D1
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'suppressed';

export interface JobRecord {
  id: string;
  chatKey: string;
  turn: number;
  stage: 'retrieve' | 'infer' | 'reply';
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}
export interface DialogTestRequest {
  agentId: string;
  message: string;
  conversationId?: string;
  useKnowledgeBase?: boolean;
}

export interface DialogTestResponse {
  conversationId: string;
  response: string;
  debugInfo: TestDebugInfo;
  metrics: TestResponseMetrics;
  searchResults?: TestSearchResult[];
}

export interface TestDebugInfo {
  agentConfig: {
    model: string;
    temperature: number;
    maxTokens: number;
    promptSystem: string;
  };
  knowledgeBasesUsed: Array<{
    kbId: string;
    name: string;
    priority: number;
    weight: number;
  }>;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timing: {
    vectorSearchTime?: number;
    aiModelTime: number;
    totalTime: number;
  };
  timestamp: string;
}

export interface TestResponseMetrics {
  responseTime: number;
  tokenCount: number;
  searchResultCount: number;
  success: boolean;
  errorMessage?: string;
}

export interface TestSearchResult {
  content: string;
  score: number;
  source: string;
  kbId: string;
  kbName: string;
}

export interface TestConversationSummary {
  id: string;
  agentId: string;
  agentName: string;
  title?: string;
  lastTurn: number;
  totalMessages: number;
  totalTokens: number;
  averageResponseTime: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface TestSessionSummary {
  id: string;
  agentId: string;
  agentName: string;
  name: string;
  description?: string;
  status: string;
  conversationCount: number;
  totalMessages: number;
  totalTokens: number;
  averageResponseTime: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface TestCaseInput {
  name: string;
  description?: string;
  agentId: string;
  inputMessages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  expectedOutputs?: string[];
  tags?: string[];
}

export interface TestCaseSummary extends TestCaseInput {
  id: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface TestRunResult {
  id: string;
  testCaseId: string;
  testSessionId: string;
  status: "pending" | "running" | "completed" | "failed";
  actualOutputs?: string[];
  metrics?: {
    totalTime: number;
    averageResponseTime: number;
    successRate: number;
    errorCount: number;
  };
  errorMessage?: string;
  startTime?: Date;
  endTime?: Date;
  createdAt: Date;
}

export interface TestPerformanceMetrics {
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  successfulResponses: number;
  failedResponses: number;
  successRate: number;
  timeRange: {
    start: Date;
    end: Date;
  };
}
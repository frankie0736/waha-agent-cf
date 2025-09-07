import { drizzle } from "drizzle-orm/d1";
import { eq, and, desc, sql } from "drizzle-orm";
import type { Env } from "../../index";
import * as schema from "../../../database/schema";
import { VectorEmbeddingManager } from "../vector-embedding";
import { AIHubMixClient } from "../aihubmix";
import { generateId } from "../../utils/id";
import type {
  DialogTestRequest,
  DialogTestResponse,
  TestDebugInfo,
  TestResponseMetrics,
  TestSearchResult,
  TestConversationSummary,
  TestSessionSummary
} from "./types";

export class DialogTestingService {
  private readonly db: ReturnType<typeof drizzle>;
  private readonly vectorManager: VectorEmbeddingManager;
  private readonly aiClient?: AIHubMixClient;

  constructor(private readonly env: Env) {
    this.db = drizzle(env.DB, { schema });
    this.vectorManager = new VectorEmbeddingManager(env);
    
    if (env.AIHUBMIX_API_KEY) {
      this.aiClient = new AIHubMixClient(env.AIHUBMIX_API_KEY);
    }
  }

  /**
   * Create a new test session
   */
  async createTestSession(
    userId: string,
    agentId: string,
    name: string,
    description?: string
  ): Promise<{ id: string; name: string; description?: string }> {
    const sessionId = generateId("test_session");
    const now = new Date();

    const [session] = await this.db
      .insert(schema.testSessions)
      .values({
        id: sessionId,
        userId,
        agentId,
        name,
        description: description || null,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return {
      id: session.id,
      name: session.name,
      description: session.description || undefined
    };
  }

  /**
   * Send a test message and get response
   */
  async sendTestMessage(
    userId: string,
    request: DialogTestRequest
  ): Promise<DialogTestResponse> {
    const startTime = Date.now();

    // Get or create test conversation
    let conversationId = request.conversationId;
    if (!conversationId) {
      conversationId = await this.createTestConversation(
        userId,
        request.agentId,
        "New Test Conversation"
      );
    }

    // Get agent details
    const agent = await this.db.query.agents.findFirst({
      where: eq(schema.agents.id, request.agentId)
    });

    if (!agent) {
      throw new Error("Agent not found");
    }

    // Get current turn number
    const currentTurn = await this.getNextTurnNumber(conversationId);

    // Save user message
    await this.saveTestMessage(
      conversationId,
      currentTurn,
      "user",
      request.message
    );

    let searchResults: TestSearchResult[] = [];
    let contextInfo = "";
    let searchTime = 0;

    // Search knowledge base if enabled
    if (request.useKnowledgeBase !== false) {
      const searchStartTime = Date.now();
      const knowledgeBases = await this.getAgentKnowledgeBases(request.agentId);
      
      for (const kb of knowledgeBases) {
        try {
          const kbResults = await this.vectorManager.searchSimilarChunks(request.message, {
            topK: 3,
            filter: { kbId: kb.kbId }
          });
          
          const kbSearchResults: TestSearchResult[] = kbResults.map(result => ({
            content: result.metadata.text,
            score: result.score,
            source: result.metadata.text.substring(0, 100) + "...",
            kbId: kb.kbId,
            kbName: kb.kbName
          }));
          
          searchResults.push(...kbSearchResults);
        } catch (error) {
          console.warn(`Vector search failed for KB ${kb.kbId}:`, error);
        }
      }
      
      searchTime = Date.now() - searchStartTime;

      // Sort by relevance and priority
      searchResults.sort((a, b) => {
        const kbA = knowledgeBases.find(kb => kb.kbId === a.kbId);
        const kbB = knowledgeBases.find(kb => kb.kbId === b.kbId);
        
        const scoreA = a.score * (1 + (kbA?.priority || 0) * 0.1) * (kbA?.weight || 1);
        const scoreB = b.score * (1 + (kbB?.priority || 0) * 0.1) * (kbB?.weight || 1);
        
        return scoreB - scoreA;
      });

      // Limit to top 5 results
      searchResults = searchResults.slice(0, 5);

      if (searchResults.length > 0) {
        contextInfo = "\n\n相关上下文信息：\n" + 
          searchResults.map(result => `- ${result.content.substring(0, 200)}...`).join("\n");
      }
    }

    // Generate AI response
    const aiStartTime = Date.now();
    let aiResponse = "";
    let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let errorMessage: string | undefined;

    try {
      if (!this.aiClient) {
        throw new Error("AI service not configured");
      }

      const response = await this.aiClient.createChatCompletion({
        model: agent.model,
        messages: [
          {
            role: "system",
            content: agent.promptSystem + contextInfo
          },
          {
            role: "user",
            content: request.message
          }
        ],
        temperature: agent.temperature,
        max_tokens: agent.maxTokens
      });

      aiResponse = response.choices[0]?.message.content || "无回复";
      tokenUsage = response.usage || tokenUsage;
    } catch (error) {
      console.error("AI response generation failed:", error);
      errorMessage = error instanceof Error ? error.message : "AI服务请求失败";
      aiResponse = "抱歉，我遇到了技术问题，无法回复您的消息。";
    }

    const aiTime = Date.now() - aiStartTime;
    const totalTime = Date.now() - startTime;

    // Save assistant message
    await this.saveTestMessage(
      conversationId,
      currentTurn + 1,
      "assistant",
      aiResponse,
      tokenUsage.totalTokens,
      totalTime,
      searchResults,
      {
        agentConfig: {
          model: agent.model,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
          promptSystem: agent.promptSystem
        },
        knowledgeBasesUsed: await this.getAgentKnowledgeBases(request.agentId),
        tokenUsage,
        timing: {
          vectorSearchTime: searchTime > 0 ? searchTime : undefined,
          aiModelTime: aiTime,
          totalTime
        },
        timestamp: new Date().toISOString()
      }
    );

    // Update conversation stats
    await this.updateConversationStats(conversationId, tokenUsage.totalTokens, totalTime);

    const debugInfo: TestDebugInfo = {
      agentConfig: {
        model: agent.model,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        promptSystem: agent.promptSystem
      },
      knowledgeBasesUsed: await this.getAgentKnowledgeBases(request.agentId),
      tokenUsage,
      timing: {
        vectorSearchTime: searchTime > 0 ? searchTime : undefined,
        aiModelTime: aiTime,
        totalTime
      },
      timestamp: new Date().toISOString()
    };

    const metrics: TestResponseMetrics = {
      responseTime: totalTime,
      tokenCount: tokenUsage.totalTokens,
      searchResultCount: searchResults.length,
      success: !errorMessage,
      errorMessage
    };

    return {
      conversationId,
      response: aiResponse,
      debugInfo,
      metrics,
      searchResults: searchResults.length > 0 ? searchResults : undefined
    };
  }

  /**
   * Get test conversation history
   */
  async getTestConversation(
    userId: string,
    conversationId: string
  ): Promise<TestConversationSummary> {
    const conversation = await this.db.query.testConversations.findFirst({
      where: eq(schema.testConversations.id, conversationId),
      with: {
        testSession: true,
        agent: true,
        messages: {
          orderBy: [desc(schema.testMessages.turn)]
        }
      }
    });

    if (!conversation) {
      throw new Error("Test conversation not found");
    }

    return {
      id: conversation.id,
      agentId: conversation.agentId,
      agentName: conversation.agent?.name || "Unknown Agent",
      title: conversation.title || undefined,
      lastTurn: conversation.lastTurn,
      totalMessages: conversation.totalMessages,
      totalTokens: conversation.totalTokens,
      averageResponseTime: conversation.averageResponseTime,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt || undefined
    };
  }

  /**
   * List test conversations for a session
   */
  async listTestConversations(
    userId: string,
    testSessionId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    conversations: TestConversationSummary[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const offset = (page - 1) * limit;

    const conversations = await this.db.query.testConversations.findMany({
      where: eq(schema.testConversations.testSessionId, testSessionId),
      with: {
        agent: true
      },
      orderBy: [desc(schema.testConversations.updatedAt)],
      limit,
      offset
    });

    const totalResult = await this.db
      .select({ count: sql`count(*)` })
      .from(schema.testConversations)
      .where(eq(schema.testConversations.testSessionId, testSessionId));

    const total = Number(totalResult[0]?.count || 0);

    const conversationSummaries: TestConversationSummary[] = conversations.map(conv => ({
      id: conv.id,
      agentId: conv.agentId,
      agentName: conv.agent?.name || "Unknown Agent",
      title: conv.title || undefined,
      lastTurn: conv.lastTurn,
      totalMessages: conv.totalMessages,
      totalTokens: conv.totalTokens,
      averageResponseTime: conv.averageResponseTime,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt || undefined
    }));

    return {
      conversations: conversationSummaries,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * List test sessions for a user
   */
  async listTestSessions(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    sessions: TestSessionSummary[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const offset = (page - 1) * limit;

    const sessions = await this.db.query.testSessions.findMany({
      where: eq(schema.testSessions.userId, userId),
      with: {
        agent: true,
        conversations: true
      },
      orderBy: [desc(schema.testSessions.updatedAt)],
      limit,
      offset
    });

    const totalResult = await this.db
      .select({ count: sql`count(*)` })
      .from(schema.testSessions)
      .where(eq(schema.testSessions.userId, userId));

    const total = Number(totalResult[0]?.count || 0);

    const sessionSummaries: TestSessionSummary[] = sessions.map(session => {
      const totalMessages = session.conversations.reduce((sum, conv) => sum + conv.totalMessages, 0);
      const totalTokens = session.conversations.reduce((sum, conv) => sum + conv.totalTokens, 0);
      const avgResponseTime = session.conversations.length > 0 
        ? session.conversations.reduce((sum, conv) => sum + conv.averageResponseTime, 0) / session.conversations.length
        : 0;

      return {
        id: session.id,
        agentId: session.agentId,
        agentName: session.agent?.name || "Unknown Agent",
        name: session.name,
        description: session.description || undefined,
        status: session.status,
        conversationCount: session.conversations.length,
        totalMessages,
        totalTokens,
        averageResponseTime: avgResponseTime,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt || undefined
      };
    });

    return {
      sessions: sessionSummaries,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Private helper methods

  private async createTestConversation(
    userId: string,
    agentId: string,
    title?: string
  ): Promise<string> {
    const conversationId = generateId("test_conv");
    const now = new Date();

    // Find an active test session for this agent, or create one
    let testSession = await this.db.query.testSessions.findFirst({
      where: and(
        eq(schema.testSessions.userId, userId),
        eq(schema.testSessions.agentId, agentId),
        eq(schema.testSessions.status, "active")
      )
    });

    if (!testSession) {
      const sessionResult = await this.createTestSession(
        userId,
        agentId,
        "Default Test Session",
        "Auto-created session for testing"
      );
      testSession = { id: sessionResult.id } as any;
    }

    await this.db
      .insert(schema.testConversations)
      .values({
        id: conversationId,
        testSessionId: testSession.id,
        agentId,
        title: title || null,
        createdAt: now,
        updatedAt: now
      });

    return conversationId;
  }

  private async getNextTurnNumber(conversationId: string): Promise<number> {
    const lastMessage = await this.db.query.testMessages.findFirst({
      where: eq(schema.testMessages.testConversationId, conversationId),
      orderBy: [desc(schema.testMessages.turn)]
    });

    return lastMessage ? lastMessage.turn + 1 : 0;
  }

  private async saveTestMessage(
    conversationId: string,
    turn: number,
    role: "user" | "assistant",
    content: string,
    tokens?: number,
    responseTime?: number,
    searchResults?: TestSearchResult[],
    debugInfo?: TestDebugInfo
  ): Promise<void> {
    await this.db
      .insert(schema.testMessages)
      .values({
        id: generateId("test_msg"),
        testConversationId: conversationId,
        turn,
        role,
        content,
        tokens: tokens || null,
        responseTime: responseTime || null,
        searchResults: searchResults ? JSON.stringify(searchResults) : null,
        debugInfo: debugInfo ? JSON.stringify(debugInfo) : null,
        timestamp: new Date()
      });
  }

  private async updateConversationStats(
    conversationId: string,
    tokenCount: number,
    responseTime: number
  ): Promise<void> {
    const conversation = await this.db.query.testConversations.findFirst({
      where: eq(schema.testConversations.id, conversationId)
    });

    if (!conversation) return;

    const newTotalMessages = conversation.totalMessages + 1;
    const newTotalTokens = conversation.totalTokens + tokenCount;
    const newAverageResponseTime = 
      (conversation.averageResponseTime * conversation.totalMessages + responseTime) / newTotalMessages;

    await this.db
      .update(schema.testConversations)
      .set({
        totalMessages: newTotalMessages,
        totalTokens: newTotalTokens,
        averageResponseTime: newAverageResponseTime,
        lastTurn: conversation.lastTurn + 1,
        updatedAt: new Date()
      })
      .where(eq(schema.testConversations.id, conversationId));
  }

  private async getAgentKnowledgeBases(agentId: string) {
    return await this.db
      .select({
        kbId: schema.agentKbLinks.kbId,
        priority: schema.agentKbLinks.priority,
        weight: schema.agentKbLinks.weight,
        kbName: schema.kbSpaces.name
      })
      .from(schema.agentKbLinks)
      .innerJoin(schema.kbSpaces, eq(schema.agentKbLinks.kbId, schema.kbSpaces.id))
      .where(eq(schema.agentKbLinks.agentId, agentId));
  }
}
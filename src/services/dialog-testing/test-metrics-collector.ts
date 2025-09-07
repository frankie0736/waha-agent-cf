import { drizzle } from "drizzle-orm/d1";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import type { Env } from "../../index";
import * as schema from "../../../database/schema";
import type { TestPerformanceMetrics } from "./types";

export class TestMetricsCollector {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(private readonly env: Env) {
    this.db = drizzle(env.DB, { schema });
  }

  /**
   * Get performance metrics for a test session
   */
  async getSessionMetrics(
    testSessionId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TestPerformanceMetrics> {
    const timeRange = {
      start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      end: endDate || new Date()
    };

    // Get all conversations in the test session within the time range
    let conversationQuery = this.db
      .select()
      .from(schema.testConversations)
      .where(eq(schema.testConversations.testSessionId, testSessionId));

    if (startDate || endDate) {
      const conditions = [eq(schema.testConversations.testSessionId, testSessionId)];
      if (startDate) conditions.push(gte(schema.testConversations.createdAt, startDate));
      if (endDate) conditions.push(lte(schema.testConversations.createdAt, endDate));
      conversationQuery = conversationQuery.where(and(...conditions));
    }

    const conversations = await conversationQuery;

    if (conversations.length === 0) {
      return {
        totalConversations: 0,
        totalMessages: 0,
        totalTokens: 0,
        averageResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        successfulResponses: 0,
        failedResponses: 0,
        successRate: 0,
        timeRange
      };
    }

    // Get messages for analysis
    const conversationIds = conversations.map(c => c.id);
    const messages = await this.db.query.testMessages.findMany({
      where: sql`test_conversation_id IN (${conversationIds.map(id => `'${id}'`).join(', ')})`
    });

    // Filter assistant messages for performance analysis
    const assistantMessages = messages.filter(m => m.role === "assistant");

    // Calculate metrics
    const totalConversations = conversations.length;
    const totalMessages = messages.length;
    const totalTokens = conversations.reduce((sum, c) => sum + c.totalTokens, 0);

    const responseTimes = assistantMessages
      .map(m => m.responseTime)
      .filter((time): time is number => time !== null && time > 0);

    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

    // Analyze success rates based on debug info
    let successfulResponses = 0;
    let failedResponses = 0;

    for (const message of assistantMessages) {
      try {
        if (message.debugInfo) {
          const debugInfo = JSON.parse(message.debugInfo);
          // Assume success if no error in debug info or content is not empty
          if (message.content && message.content.trim() !== "") {
            successfulResponses++;
          } else {
            failedResponses++;
          }
        } else if (message.content && message.content.trim() !== "") {
          successfulResponses++;
        } else {
          failedResponses++;
        }
      } catch {
        // If we can't parse debug info, assume success if there's content
        if (message.content && message.content.trim() !== "") {
          successfulResponses++;
        } else {
          failedResponses++;
        }
      }
    }

    const successRate = (successfulResponses + failedResponses) > 0 
      ? successfulResponses / (successfulResponses + failedResponses)
      : 0;

    return {
      totalConversations,
      totalMessages,
      totalTokens,
      averageResponseTime,
      minResponseTime,
      maxResponseTime,
      successfulResponses,
      failedResponses,
      successRate,
      timeRange
    };
  }

  /**
   * Get performance metrics for a specific agent across all test sessions
   */
  async getAgentMetrics(
    userId: string,
    agentId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TestPerformanceMetrics> {
    const timeRange = {
      start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: endDate || new Date()
    };

    // Get all test sessions for the agent
    let sessionQuery = this.db
      .select()
      .from(schema.testSessions)
      .where(and(
        eq(schema.testSessions.userId, userId),
        eq(schema.testSessions.agentId, agentId)
      ));

    if (startDate || endDate) {
      const conditions = [
        eq(schema.testSessions.userId, userId),
        eq(schema.testSessions.agentId, agentId)
      ];
      if (startDate) conditions.push(gte(schema.testSessions.createdAt, startDate));
      if (endDate) conditions.push(lte(schema.testSessions.createdAt, endDate));
      sessionQuery = sessionQuery.where(and(...conditions));
    }

    const testSessions = await sessionQuery;

    if (testSessions.length === 0) {
      return {
        totalConversations: 0,
        totalMessages: 0,
        totalTokens: 0,
        averageResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        successfulResponses: 0,
        failedResponses: 0,
        successRate: 0,
        timeRange
      };
    }

    // Aggregate metrics from all sessions
    const allMetrics = await Promise.all(
      testSessions.map(session => 
        this.getSessionMetrics(session.id, startDate, endDate)
      )
    );

    // Combine metrics
    const combinedMetrics = allMetrics.reduce((combined, metrics) => ({
      totalConversations: combined.totalConversations + metrics.totalConversations,
      totalMessages: combined.totalMessages + metrics.totalMessages,
      totalTokens: combined.totalTokens + metrics.totalTokens,
      averageResponseTime: 0, // Will calculate below
      minResponseTime: Math.min(combined.minResponseTime || Infinity, metrics.minResponseTime || Infinity),
      maxResponseTime: Math.max(combined.maxResponseTime, metrics.maxResponseTime),
      successfulResponses: combined.successfulResponses + metrics.successfulResponses,
      failedResponses: combined.failedResponses + metrics.failedResponses,
      successRate: 0, // Will calculate below
      timeRange
    }), {
      totalConversations: 0,
      totalMessages: 0,
      totalTokens: 0,
      averageResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      successfulResponses: 0,
      failedResponses: 0,
      successRate: 0,
      timeRange
    });

    // Calculate weighted averages
    const validMetrics = allMetrics.filter(m => m.totalMessages > 0);
    
    if (validMetrics.length > 0) {
      const totalMessages = validMetrics.reduce((sum, m) => sum + m.totalMessages, 0);
      combinedMetrics.averageResponseTime = totalMessages > 0 
        ? validMetrics.reduce((sum, m) => sum + (m.averageResponseTime * m.totalMessages), 0) / totalMessages
        : 0;
    }

    const totalResponses = combinedMetrics.successfulResponses + combinedMetrics.failedResponses;
    combinedMetrics.successRate = totalResponses > 0 
      ? combinedMetrics.successfulResponses / totalResponses
      : 0;

    // Fix infinity values
    if (!isFinite(combinedMetrics.minResponseTime)) {
      combinedMetrics.minResponseTime = 0;
    }

    return combinedMetrics;
  }

  /**
   * Get top performing test conversations
   */
  async getTopPerformingConversations(
    testSessionId: string,
    limit: number = 10
  ): Promise<Array<{
    id: string;
    title: string;
    totalMessages: number;
    totalTokens: number;
    averageResponseTime: number;
    successRate: number;
    createdAt: Date;
  }>> {
    const conversations = await this.db.query.testConversations.findMany({
      where: eq(schema.testConversations.testSessionId, testSessionId),
      orderBy: [sql`average_response_time ASC`, sql`total_messages DESC`],
      limit
    });

    const results = [];

    for (const conversation of conversations) {
      const messages = await this.db.query.testMessages.findMany({
        where: eq(schema.testMessages.testConversationId, conversation.id)
      });

      const assistantMessages = messages.filter(m => m.role === "assistant");
      const successfulMessages = assistantMessages.filter(m => 
        m.content && m.content.trim() !== ""
      );

      const successRate = assistantMessages.length > 0 
        ? successfulMessages.length / assistantMessages.length
        : 0;

      results.push({
        id: conversation.id,
        title: conversation.title || `Conversation ${conversation.id.slice(0, 8)}`,
        totalMessages: conversation.totalMessages,
        totalTokens: conversation.totalTokens,
        averageResponseTime: conversation.averageResponseTime,
        successRate,
        createdAt: conversation.createdAt
      });
    }

    return results;
  }

  /**
   * Get response time distribution
   */
  async getResponseTimeDistribution(
    testSessionId: string,
    bucketCount: number = 10
  ): Promise<Array<{
    range: string;
    count: number;
    percentage: number;
  }>> {
    const conversations = await this.db.query.testConversations.findMany({
      where: eq(schema.testConversations.testSessionId, testSessionId)
    });

    if (conversations.length === 0) {
      return [];
    }

    const conversationIds = conversations.map(c => c.id);
    const messages = await this.db.query.testMessages.findMany({
      where: sql`test_conversation_id IN (${conversationIds.map(id => `'${id}'`).join(', ')})`
    });

    const responseTimes = messages
      .filter(m => m.role === "assistant" && m.responseTime)
      .map(m => m.responseTime!)
      .sort((a, b) => a - b);

    if (responseTimes.length === 0) {
      return [];
    }

    const min = Math.min(...responseTimes);
    const max = Math.max(...responseTimes);
    const bucketSize = (max - min) / bucketCount;

    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const bucketMin = min + (i * bucketSize);
      const bucketMax = min + ((i + 1) * bucketSize);
      
      const count = responseTimes.filter(time => 
        time >= bucketMin && (i === bucketCount - 1 ? time <= bucketMax : time < bucketMax)
      ).length;

      return {
        range: `${Math.round(bucketMin)}-${Math.round(bucketMax)}ms`,
        count,
        percentage: (count / responseTimes.length) * 100
      };
    });

    return buckets;
  }

  /**
   * Get error analysis
   */
  async getErrorAnalysis(
    testSessionId: string
  ): Promise<{
    totalErrors: number;
    errorsByType: Array<{
      type: string;
      count: number;
      percentage: number;
      examples: string[];
    }>;
    commonPatterns: string[];
  }> {
    const conversations = await this.db.query.testConversations.findMany({
      where: eq(schema.testConversations.testSessionId, testSessionId)
    });

    const conversationIds = conversations.map(c => c.id);
    const messages = await this.db.query.testMessages.findMany({
      where: sql`test_conversation_id IN (${conversationIds.map(id => `'${id}'`).join(', ')})`
    });

    const errorMessages = messages.filter(m => {
      if (!m.debugInfo) return false;
      
      try {
        const debugInfo = JSON.parse(m.debugInfo);
        return debugInfo.error || !m.content || m.content.trim() === "";
      } catch {
        return !m.content || m.content.trim() === "";
      }
    });

    const totalErrors = errorMessages.length;
    const errorTypes = new Map<string, { count: number; examples: string[] }>();

    for (const message of errorMessages) {
      let errorType = "unknown_error";
      let example = message.content || "No response";

      try {
        if (message.debugInfo) {
          const debugInfo = JSON.parse(message.debugInfo);
          if (debugInfo.error) {
            errorType = this.categorizeError(debugInfo.error);
            example = debugInfo.error;
          } else if (!message.content) {
            errorType = "empty_response";
          }
        }
      } catch {
        errorType = "parsing_error";
      }

      if (!errorTypes.has(errorType)) {
        errorTypes.set(errorType, { count: 0, examples: [] });
      }

      const errorData = errorTypes.get(errorType)!;
      errorData.count++;
      if (errorData.examples.length < 3) {
        errorData.examples.push(example);
      }
    }

    const errorsByType = Array.from(errorTypes.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      percentage: totalErrors > 0 ? (data.count / totalErrors) * 100 : 0,
      examples: data.examples
    }));

    // Simple common pattern detection
    const commonPatterns = this.detectCommonErrorPatterns(errorMessages);

    return {
      totalErrors,
      errorsByType,
      commonPatterns
    };
  }

  private categorizeError(error: string): string {
    error = error.toLowerCase();
    
    if (error.includes("timeout") || error.includes("time out")) {
      return "timeout_error";
    }
    if (error.includes("rate limit") || error.includes("too many requests")) {
      return "rate_limit_error";
    }
    if (error.includes("authentication") || error.includes("unauthorized")) {
      return "auth_error";
    }
    if (error.includes("network") || error.includes("connection")) {
      return "network_error";
    }
    if (error.includes("token") && error.includes("limit")) {
      return "token_limit_error";
    }
    if (error.includes("model") || error.includes("invalid")) {
      return "model_error";
    }
    
    return "unknown_error";
  }

  private detectCommonErrorPatterns(errorMessages: any[]): string[] {
    const patterns = [];
    
    if (errorMessages.length > 10) {
      const recentErrors = errorMessages.slice(-10);
      const timeGaps = [];
      
      for (let i = 1; i < recentErrors.length; i++) {
        const gap = recentErrors[i].timestamp.getTime() - recentErrors[i-1].timestamp.getTime();
        timeGaps.push(gap);
      }
      
      const avgGap = timeGaps.reduce((sum, gap) => sum + gap, 0) / timeGaps.length;
      if (avgGap < 60000) { // Less than 1 minute
        patterns.push("Errors occurring in rapid succession");
      }
    }

    const errorsByHour = new Map<number, number>();
    errorMessages.forEach(message => {
      const hour = message.timestamp.getHours();
      errorsByHour.set(hour, (errorsByHour.get(hour) || 0) + 1);
    });

    const peakHour = Array.from(errorsByHour.entries()).reduce((max, [hour, count]) =>
      count > (max[1] || 0) ? [hour, count] : max, [0, 0]
    );

    if (peakHour[1] > errorMessages.length * 0.3) {
      patterns.push(`Errors peak during ${peakHour[0]}:00-${peakHour[0] + 1}:00`);
    }

    return patterns;
  }
}
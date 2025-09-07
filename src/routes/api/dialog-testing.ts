import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, sql } from "drizzle-orm";
import type { Env } from "../../index";
import { ApiErrors } from "../../middleware/error-handler";
import * as schema from "../../../database/schema";
import { 
  DialogTestingService, 
  TestCaseManager, 
  TestMetricsCollector 
} from "../../services/dialog-testing";

const dialogTesting = new Hono<{ Bindings: Env }>();

// Test Sessions

// Create test session
const createTestSessionRoute = dialogTesting.post(
  "/sessions",
  zValidator("json", z.object({
    agentId: z.string().min(1, "智能体ID不能为空"),
    name: z.string().min(1, "会话名称不能为空").max(100, "会话名称不能超过100个字符"),
    description: z.string().max(500, "描述不能超过500个字符").optional()
  })),
  async (c) => {
    // TODO: 从会话中获取用户ID
    const userId = "test-user-1";
    const dialogService = new DialogTestingService(c.env);
    
    const { agentId, name, description } = c.req.valid("json");

    try {
      const session = await dialogService.createTestSession(userId, agentId, name, description);
      
      return c.json({
        success: true,
        data: session,
        message: "测试会话创建成功"
      }, 201);
    } catch (error) {
      console.error("Create test session failed:", error);
      throw ApiErrors.InternalServerError("创建测试会话失败");
    }
  }
);

// List test sessions
const listTestSessionsRoute = dialogTesting.get(
  "/sessions",
  zValidator("query", z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 20)
  })),
  async (c) => {
    const userId = "test-user-1";
    const dialogService = new DialogTestingService(c.env);
    
    const { page, limit } = c.req.valid("query");

    try {
      const result = await dialogService.listTestSessions(userId, page, limit);
      
      return c.json({
        success: true,
        data: result.sessions,
        meta: result.meta
      });
    } catch (error) {
      console.error("List test sessions failed:", error);
      throw ApiErrors.InternalServerError("获取测试会话列表失败");
    }
  }
);

// Test Messages

// Send test message
const sendTestMessageRoute = dialogTesting.post(
  "/messages",
  zValidator("json", z.object({
    agentId: z.string().min(1, "智能体ID不能为空"),
    message: z.string().min(1, "消息内容不能为空"),
    conversationId: z.string().optional(),
    useKnowledgeBase: z.boolean().default(true)
  })),
  async (c) => {
    const userId = "test-user-1";
    const dialogService = new DialogTestingService(c.env);
    
    const request = c.req.valid("json");

    try {
      const response = await dialogService.sendTestMessage(userId, {
        ...request,
        conversationId: request.conversationId || undefined
      } as any);
      
      return c.json({
        success: true,
        data: response,
        message: "消息发送成功"
      });
    } catch (error) {
      console.error("Send test message failed:", error);
      throw ApiErrors.InternalServerError(
        error instanceof Error ? error.message : "发送测试消息失败"
      );
    }
  }
);

// Test Conversations

// Get test conversation
const getTestConversationRoute = dialogTesting.get(
  "/conversations/:conversation_id",
  zValidator("param", z.object({
    conversation_id: z.string()
  })),
  async (c) => {
    const userId = "test-user-1";
    const dialogService = new DialogTestingService(c.env);
    
    const { conversation_id } = c.req.valid("param");

    try {
      const conversation = await dialogService.getTestConversation(userId, conversation_id);
      
      return c.json({
        success: true,
        data: conversation
      });
    } catch (error) {
      console.error("Get test conversation failed:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        throw ApiErrors.NotFound("测试对话不存在");
      }
      throw ApiErrors.InternalServerError("获取测试对话失败");
    }
  }
);

// List test conversations
const listTestConversationsRoute = dialogTesting.get(
  "/sessions/:session_id/conversations",
  zValidator("param", z.object({
    session_id: z.string()
  })),
  zValidator("query", z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 20)
  })),
  async (c) => {
    const userId = "test-user-1";
    const dialogService = new DialogTestingService(c.env);
    
    const { session_id } = c.req.valid("param");
    const { page, limit } = c.req.valid("query");

    try {
      const result = await dialogService.listTestConversations(userId, session_id, page, limit);
      
      return c.json({
        success: true,
        data: result.conversations,
        meta: result.meta
      });
    } catch (error) {
      console.error("List test conversations failed:", error);
      throw ApiErrors.InternalServerError("获取测试对话列表失败");
    }
  }
);

// Get conversation history with detailed messages
const getConversationHistoryRoute = dialogTesting.get(
  "/conversations/:conversation_id/messages",
  zValidator("param", z.object({
    conversation_id: z.string()
  })),
  zValidator("query", z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 50),
    includeDebugInfo: z.string().optional().transform(val => val === "true")
  })),
  async (c) => {
    const userId = "test-user-1";
    const db = drizzle(c.env.DB, { schema });
    
    const { conversation_id } = c.req.valid("param");
    const { page, limit, includeDebugInfo } = c.req.valid("query");
    const offset = (page - 1) * limit;

    try {
      // Verify conversation exists and user has access
      const conversation = await db.query.testConversations.findFirst({
        where: schema.eq(schema.testConversations.id, conversation_id),
        with: {
          testSession: true
        }
      });

      if (!conversation || conversation.testSession.userId !== userId) {
        throw ApiErrors.NotFound("测试对话不存在");
      }

      // Get messages
      const messages = await db.query.testMessages.findMany({
        where: schema.eq(schema.testMessages.testConversationId, conversation_id),
        orderBy: [schema.desc(schema.testMessages.turn)],
        limit,
        offset
      });

      const processedMessages = messages.map(message => ({
        id: message.id,
        turn: message.turn,
        role: message.role,
        content: message.content,
        tokens: message.tokens,
        responseTime: message.responseTime,
        timestamp: message.timestamp,
        ...(includeDebugInfo && {
          searchResults: message.searchResults ? JSON.parse(message.searchResults) : null,
          debugInfo: message.debugInfo ? JSON.parse(message.debugInfo) : null
        })
      }));

      // Get total count
      const totalResult = await db
        .select({ count: schema.sql`count(*)` })
        .from(schema.testMessages)
        .where(schema.eq(schema.testMessages.testConversationId, conversation_id));

      const total = Number(totalResult[0]?.count || 0);

      return c.json({
        success: true,
        data: {
          conversation: {
            id: conversation.id,
            agentId: conversation.agentId,
            title: conversation.title,
            totalMessages: conversation.totalMessages,
            totalTokens: conversation.totalTokens,
            averageResponseTime: conversation.averageResponseTime
          },
          messages: processedMessages
        },
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      if (error instanceof ApiErrors.constructor) {
        throw error;
      }
      console.error("Get conversation history failed:", error);
      throw ApiErrors.InternalServerError("获取对话历史失败");
    }
  }
);

// Test Cases

// Create test case
const createTestCaseRoute = dialogTesting.post(
  "/test-cases",
  zValidator("json", z.object({
    name: z.string().min(1, "测试用例名称不能为空").max(100, "测试用例名称不能超过100个字符"),
    description: z.string().max(500, "描述不能超过500个字符").optional(),
    agentId: z.string().min(1, "智能体ID不能为空"),
    inputMessages: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1, "消息内容不能为空")
    })).min(1, "至少需要一条输入消息"),
    expectedOutputs: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional()
  })),
  async (c) => {
    const userId = "test-user-1";
    const testCaseManager = new TestCaseManager(c.env);
    
    const testCaseData = c.req.valid("json");

    try {
      const testCase = await testCaseManager.createTestCase(userId, testCaseData as any);
      
      return c.json({
        success: true,
        data: testCase,
        message: "测试用例创建成功"
      }, 201);
    } catch (error) {
      console.error("Create test case failed:", error);
      throw ApiErrors.InternalServerError("创建测试用例失败");
    }
  }
);

// List test cases
const listTestCasesRoute = dialogTesting.get(
  "/test-cases",
  zValidator("query", z.object({
    agentId: z.string().optional(),
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 20)
  })),
  async (c) => {
    const userId = "test-user-1";
    const testCaseManager = new TestCaseManager(c.env);
    
    const { agentId, page, limit } = c.req.valid("query");

    try {
      const result = await testCaseManager.listTestCases(userId, agentId, page, limit);
      
      return c.json({
        success: true,
        data: result.testCases,
        meta: result.meta
      });
    } catch (error) {
      console.error("List test cases failed:", error);
      throw ApiErrors.InternalServerError("获取测试用例列表失败");
    }
  }
);

// Run test case
const runTestCaseRoute = dialogTesting.post(
  "/test-cases/:test_case_id/run",
  zValidator("param", z.object({
    test_case_id: z.string()
  })),
  zValidator("json", z.object({
    testSessionId: z.string().optional()
  })),
  async (c) => {
    const userId = "test-user-1";
    const testCaseManager = new TestCaseManager(c.env);
    
    const { test_case_id } = c.req.valid("param");
    const { testSessionId } = c.req.valid("json");

    try {
      const testRun = await testCaseManager.runTestCase(userId, test_case_id, testSessionId);
      
      return c.json({
        success: true,
        data: testRun,
        message: "测试用例运行完成"
      });
    } catch (error) {
      console.error("Run test case failed:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        throw ApiErrors.NotFound("测试用例不存在");
      }
      throw ApiErrors.InternalServerError("运行测试用例失败");
    }
  }
);

// Get test run results
const getTestRunRoute = dialogTesting.get(
  "/test-runs/:run_id",
  zValidator("param", z.object({
    run_id: z.string()
  })),
  async (c) => {
    const userId = "test-user-1";
    const testCaseManager = new TestCaseManager(c.env);
    
    const { run_id } = c.req.valid("param");

    try {
      const testRun = await testCaseManager.getTestRun(userId, run_id);
      
      if (!testRun) {
        throw ApiErrors.NotFound("测试运行不存在");
      }
      
      return c.json({
        success: true,
        data: testRun
      });
    } catch (error) {
      if (error instanceof ApiErrors.constructor) {
        throw error;
      }
      console.error("Get test run failed:", error);
      throw ApiErrors.InternalServerError("获取测试运行结果失败");
    }
  }
);

// Metrics and Analytics

// Get session metrics
const getSessionMetricsRoute = dialogTesting.get(
  "/sessions/:session_id/metrics",
  zValidator("param", z.object({
    session_id: z.string()
  })),
  zValidator("query", z.object({
    startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
    endDate: z.string().optional().transform(val => val ? new Date(val) : undefined)
  })),
  async (c) => {
    const metricsCollector = new TestMetricsCollector(c.env);
    
    const { session_id } = c.req.valid("param");
    const { startDate, endDate } = c.req.valid("query");

    try {
      const metrics = await metricsCollector.getSessionMetrics(session_id, startDate, endDate);
      
      return c.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error("Get session metrics failed:", error);
      throw ApiErrors.InternalServerError("获取会话指标失败");
    }
  }
);

// Get agent metrics
const getAgentMetricsRoute = dialogTesting.get(
  "/agents/:agent_id/metrics",
  zValidator("param", z.object({
    agent_id: z.string()
  })),
  zValidator("query", z.object({
    startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
    endDate: z.string().optional().transform(val => val ? new Date(val) : undefined)
  })),
  async (c) => {
    const userId = "test-user-1";
    const metricsCollector = new TestMetricsCollector(c.env);
    
    const { agent_id } = c.req.valid("param");
    const { startDate, endDate } = c.req.valid("query");

    try {
      const metrics = await metricsCollector.getAgentMetrics(userId, agent_id, startDate, endDate);
      
      return c.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error("Get agent metrics failed:", error);
      throw ApiErrors.InternalServerError("获取智能体指标失败");
    }
  }
);

// Get response time distribution
const getResponseTimeDistributionRoute = dialogTesting.get(
  "/sessions/:session_id/response-time-distribution",
  zValidator("param", z.object({
    session_id: z.string()
  })),
  zValidator("query", z.object({
    buckets: z.string().optional().transform(val => val ? parseInt(val) : 10)
  })),
  async (c) => {
    const metricsCollector = new TestMetricsCollector(c.env);
    
    const { session_id } = c.req.valid("param");
    const { buckets } = c.req.valid("query");

    try {
      const distribution = await metricsCollector.getResponseTimeDistribution(session_id, buckets);
      
      return c.json({
        success: true,
        data: distribution
      });
    } catch (error) {
      console.error("Get response time distribution failed:", error);
      throw ApiErrors.InternalServerError("获取响应时间分布失败");
    }
  }
);

// Get error analysis
const getErrorAnalysisRoute = dialogTesting.get(
  "/sessions/:session_id/error-analysis",
  zValidator("param", z.object({
    session_id: z.string()
  })),
  async (c) => {
    const metricsCollector = new TestMetricsCollector(c.env);
    
    const { session_id } = c.req.valid("param");

    try {
      const analysis = await metricsCollector.getErrorAnalysis(session_id);
      
      return c.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error("Get error analysis failed:", error);
      throw ApiErrors.InternalServerError("获取错误分析失败");
    }
  }
);

// Mount all routes
dialogTesting.route("/sessions", createTestSessionRoute);
dialogTesting.route("/sessions", listTestSessionsRoute);
dialogTesting.route("/messages", sendTestMessageRoute);
dialogTesting.route("/conversations/:conversation_id", getTestConversationRoute);
dialogTesting.route("/sessions/:session_id/conversations", listTestConversationsRoute);
dialogTesting.route("/conversations/:conversation_id/messages", getConversationHistoryRoute);
dialogTesting.route("/test-cases", createTestCaseRoute);
dialogTesting.route("/test-cases", listTestCasesRoute);
dialogTesting.route("/test-cases/:test_case_id/run", runTestCaseRoute);
dialogTesting.route("/test-runs/:run_id", getTestRunRoute);
dialogTesting.route("/sessions/:session_id/metrics", getSessionMetricsRoute);
dialogTesting.route("/agents/:agent_id/metrics", getAgentMetricsRoute);
dialogTesting.route("/sessions/:session_id/response-time-distribution", getResponseTimeDistributionRoute);
dialogTesting.route("/sessions/:session_id/error-analysis", getErrorAnalysisRoute);

export { dialogTesting };
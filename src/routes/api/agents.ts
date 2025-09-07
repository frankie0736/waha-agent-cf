import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../../index";
import { ApiErrors } from "../../middleware/error-handler";
import * as schema from "../../../database/schema";
import { VectorEmbeddingManager } from "../../services/vector-embedding";
import { AIHubMixClient } from "../../services/aihubmix";
import { generateId } from "../../utils/id";

const agents = new Hono<{ Bindings: Env }>();

// Agent Templates - Predefined configurations
const agentTemplates = [
  {
    id: "customer_service",
    name: "客服助手",
    description: "专业的客服智能体，擅长处理客户询问和问题解决",
    promptSystem: `你是一个专业的客服助手。请遵循以下原则：

1. 始终保持礼貌、耐心和专业的态度
2. 准确理解客户的问题并提供有针对性的解决方案
3. 如果不确定答案，请诚实告知并寻求帮助
4. 在适当时候主动提供相关的有用信息
5. 保持回答简洁明了，避免过于冗长

当客户提出问题时，请：
- 首先确认理解客户的具体需求
- 基于知识库信息提供准确答案
- 如需进一步协助，请引导客户联系人工客服`,
    model: "gpt-3.5-turbo",
    temperature: 0.3,
    maxTokens: 800
  },
  {
    id: "sales_assistant",
    name: "销售助手", 
    description: "智能销售顾问，帮助客户了解产品和服务",
    promptSystem: `你是一个经验丰富的销售助手。请遵循以下原则：

1. 热情友好地接待每一位客户
2. 深入了解客户需求，提供个性化推荐
3. 详细介绍产品特点和优势
4. 适时提出成交建议，但不要过于推销
5. 建立信任关系，关注长期客户价值

与客户交流时，请：
- 主动询问客户的具体需求和预算
- 基于知识库推荐最适合的产品或服务
- 解答客户疑虑，消除购买障碍
- 提供优惠信息和促销活动详情`,
    model: "gpt-3.5-turbo",
    temperature: 0.5,
    maxTokens: 1000
  },
  {
    id: "technical_support",
    name: "技术支持",
    description: "专业技术支持专家，解决技术问题和故障",
    promptSystem: `你是一个专业的技术支持专家。请遵循以下原则：

1. 准确诊断技术问题的根本原因
2. 提供清晰的步骤化解决方案
3. 使用通俗易懂的语言解释技术概念
4. 耐心指导用户完成操作步骤
5. 确保问题得到彻底解决

处理技术问题时，请：
- 详细了解问题的具体表现和发生环境
- 基于知识库提供标准化解决方案
- 如需进一步排查，请提供详细的故障排除步骤
- 建议预防措施避免问题再次发生`,
    model: "gpt-4",
    temperature: 0.2,
    maxTokens: 1200
  }
];

// Create agent
const createAgentRoute = agents.post(
  "/",
  zValidator("json", z.object({
    name: z.string().min(1, "智能体名称不能为空").max(100, "智能体名称不能超过100个字符"),
    description: z.string().max(500, "描述不能超过500个字符").optional(),
    promptSystem: z.string().min(1, "系统提示词不能为空").max(4000, "系统提示词不能超过4000个字符"),
    model: z.string().min(1, "模型不能为空"),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().min(1).max(4000).default(1000),
    knowledgeBases: z.array(z.object({
      kbId: z.string(),
      priority: z.number().int().min(0).max(100).default(0),
      weight: z.number().min(0).max(10).default(1.0)
    })).optional().default([])
  })),
  async (c) => {
    try {
      // TODO: 从会话中获取用户ID
      // const session = await getSession(c);
      // if (!session) throw ApiErrors.Unauthorized();
      const userId = "test-user-1"; // 临时使用测试用户ID
      
      const db = drizzle(c.env.DB, { schema });

      const agentData = c.req.valid("json");
      const agentId = generateId("agent");
      const now = new Date();

      // Validate knowledge base exists and user has access
      if (agentData.knowledgeBases.length > 0) {
        const kbIds = agentData.knowledgeBases.map((kb: any) => kb.kbId);
        const existingKbs = await db.query.kbSpaces.findMany({
          where: eq(schema.kbSpaces.userId, userId),
          columns: { id: true }
        });
        
        const existingKbIds = existingKbs.map(kb => kb.id);
        const invalidKbIds = kbIds.filter(id => !existingKbIds.includes(id));
        
        if (invalidKbIds.length > 0) {
          throw ApiErrors.ValidationError(`知识库不存在或无访问权限: ${invalidKbIds.join(", ")}`);
        }
      }

      // Insert agent
      const [newAgent] = await db
        .insert(schema.agents)
        .values({
          id: agentId,
          userId,
          name: agentData.name,
          description: agentData.description || null,
          promptSystem: agentData.promptSystem,
          model: agentData.model,
          temperature: agentData.temperature,
          maxTokens: agentData.maxTokens,
          createdAt: now,
          updatedAt: now
        })
        .returning();

      // Insert knowledge base links
      if (agentData.knowledgeBases.length > 0) {
        await db
          .insert(schema.agentKbLinks)
          .values(
            agentData.knowledgeBases.map((kb: any) => ({
              id: generateId("agentKbLink"),
              agentId: agentId,
              kbId: kb.kbId,
              priority: kb.priority,
              weight: kb.weight,
              createdAt: now
            }))
          );
      }

      return c.json({
        success: true,
        data: newAgent,
        message: "智能体创建成功"
      }, 201);

    } catch (error) {
      if (error instanceof z.ZodError) {
        throw ApiErrors.ValidationError("输入数据验证失败", { issues: error.issues });
      }
      throw error;
    }
  }
);

// Get agent list
const listAgentsRoute = agents.get(
  "/",
  zValidator("query", z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 20),
    search: z.string().optional()
  })),
  async (c) => {
    // TODO: 从会话中获取用户ID
    const userId = "test-user-1";
    const db = drizzle(c.env.DB, { schema });

    const { page, limit, search } = c.req.valid("query");
    const offset = (page - 1) * limit;

    // Get agents list
    const agentsList = await db.query.agents.findMany({
      where: eq(schema.agents.userId, userId),
      columns: {
        id: true,
        name: true,
        description: true,
        model: true,
        temperature: true,
        maxTokens: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: [desc(schema.agents.createdAt)],
      limit,
      offset
    });

    // Get total count
    const totalResult = await db
      .select({ count: sql`count(*)` })
      .from(schema.agents)
      .where(eq(schema.agents.userId, userId));
    
    const totalCount = Number(totalResult[0]?.count || 0);

    return c.json({
      success: true,
      data: agentsList,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  }
);

// Get agent details
const getAgentRoute = agents.get(
  "/:agent_id",
  zValidator("param", z.object({
    agent_id: z.string()
  })),
  async (c) => {
    // TODO: 从会话中获取用户ID
    const userId = "test-user-1";
    const db = drizzle(c.env.DB, { schema });
    
    const { agent_id } = c.req.valid("param");

    // Get agent with knowledge base links
    const agent = await db.query.agents.findFirst({
      where: and(
        eq(schema.agents.id, agent_id),
        eq(schema.agents.userId, userId)
      )
    });

    if (!agent) {
      throw ApiErrors.NotFound("智能体不存在");
    }

    // Get associated knowledge bases
    const knowledgeBases = await db
      .select({
        kbId: schema.agentKbLinks.kbId,
        priority: schema.agentKbLinks.priority,
        weight: schema.agentKbLinks.weight,
        kbName: schema.kbSpaces.name,
        kbDescription: schema.kbSpaces.description
      })
      .from(schema.agentKbLinks)
      .innerJoin(schema.kbSpaces, eq(schema.agentKbLinks.kbId, schema.kbSpaces.id))
      .where(eq(schema.agentKbLinks.agentId, agent_id));

    return c.json({
      success: true,
      data: {
        ...agent,
        knowledgeBases
      }
    });
  }
);

// Update agent
const updateAgentRoute = agents.put(
  "/:agent_id",
  zValidator("param", z.object({
    agent_id: z.string()
  })),
  zValidator("json", z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    promptSystem: z.string().min(1).max(4000).optional(),
    model: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1).max(4000).optional(),
    knowledgeBases: z.array(z.object({
      kbId: z.string(),
      priority: z.number().int().min(0).max(100).default(0),
      weight: z.number().min(0).max(10).default(1.0)
    })).optional()
  })),
  async (c) => {
    // TODO: 从会话中获取用户ID
    const userId = "test-user-1";
    const db = drizzle(c.env.DB, { schema });

    const { agent_id } = c.req.valid("param");
    const updateData = c.req.valid("json");

    // Check if agent exists and belongs to user
    const existingAgent = await db.query.agents.findFirst({
      where: and(
        eq(schema.agents.id, agent_id),
        eq(schema.agents.userId, userId)
      )
    });

    if (!existingAgent) {
      throw ApiErrors.NotFound("智能体不存在");
    }

    // Validate knowledge bases if provided
    if (updateData.knowledgeBases) {
      const kbIds = updateData.knowledgeBases.map((kb: any) => kb.kbId);
      if (kbIds.length > 0) {
        const existingKbs = await db.query.kbSpaces.findMany({
          where: eq(schema.kbSpaces.userId, userId),
          columns: { id: true }
        });
        
        const existingKbIds = existingKbs.map(kb => kb.id);
        const invalidKbIds = kbIds.filter(id => !existingKbIds.includes(id));
        
        if (invalidKbIds.length > 0) {
          throw ApiErrors.ValidationError(`知识库不存在或无访问权限: ${invalidKbIds.join(", ")}`);
        }
      }

      // Update knowledge base links
      await db
        .delete(schema.agentKbLinks)
        .where(eq(schema.agentKbLinks.agentId, agent_id));

      if (updateData.knowledgeBases.length > 0) {
        await db
          .insert(schema.agentKbLinks)
          .values(
            updateData.knowledgeBases.map((kb: any) => ({
              id: generateId("agentKbLink"),
              agentId: agent_id,
              kbId: kb.kbId,
              priority: kb.priority,
              weight: kb.weight,
              createdAt: new Date()
            }))
          );
      }
    }

    // Update agent basic info
    const { knowledgeBases, ...agentUpdate } = updateData;
    
    if (Object.keys(agentUpdate).length > 0) {
      // Convert undefined to null for optional fields
      const cleanUpdate: any = { updatedAt: new Date() };
      
      if (agentUpdate.name !== undefined) cleanUpdate.name = agentUpdate.name;
      if (agentUpdate.description !== undefined) cleanUpdate.description = agentUpdate.description || null;
      if (agentUpdate.promptSystem !== undefined) cleanUpdate.promptSystem = agentUpdate.promptSystem;
      if (agentUpdate.model !== undefined) cleanUpdate.model = agentUpdate.model;
      if (agentUpdate.temperature !== undefined) cleanUpdate.temperature = agentUpdate.temperature;
      if (agentUpdate.maxTokens !== undefined) cleanUpdate.maxTokens = agentUpdate.maxTokens;
      
      await db
        .update(schema.agents)
        .set(cleanUpdate)
        .where(eq(schema.agents.id, agent_id));
    }

    return c.json({
      success: true,
      message: "智能体更新成功"
    });
  }
);

// Delete agent
const deleteAgentRoute = agents.delete(
  "/:agent_id",
  zValidator("param", z.object({
    agent_id: z.string()
  })),
  async (c) => {
    // TODO: 从会话中获取用户ID
    const userId = "test-user-1";
    const db = drizzle(c.env.DB, { schema });

    const { agent_id } = c.req.valid("param");

    // Check if agent exists and belongs to user
    const existingAgent = await db.query.agents.findFirst({
      where: and(
        eq(schema.agents.id, agent_id),
        eq(schema.agents.userId, userId)
      )
    });

    if (!existingAgent) {
      throw ApiErrors.NotFound("智能体不存在");
    }

    // Delete knowledge base links first
    await db
      .delete(schema.agentKbLinks)
      .where(eq(schema.agentKbLinks.agentId, agent_id));

    // Delete agent
    await db
      .delete(schema.agents)
      .where(eq(schema.agents.id, agent_id));

    return c.json({
      success: true,
      message: "智能体删除成功"
    });
  }
);

// Get agent templates
const getTemplatesRoute = agents.get("/templates", async (c) => {
  return c.json({
    success: true,
    data: agentTemplates
  });
});

// Create agent from template
const createFromTemplateRoute = agents.post(
  "/from-template/:template_id",
  zValidator("param", z.object({
    template_id: z.string()
  })),
  zValidator("json", z.object({
    name: z.string().min(1).max(100).optional(),
    knowledgeBases: z.array(z.object({
      kbId: z.string(),
      priority: z.number().int().min(0).max(100).default(0),
      weight: z.number().min(0).max(10).default(1.0)
    })).optional().default([])
  })),
  async (c) => {
    // TODO: 从会话中获取用户ID
    const userId = "test-user-1";
    const db = drizzle(c.env.DB, { schema });

    const { template_id } = c.req.valid("param");
    const { name, knowledgeBases } = c.req.valid("json");

    const template = agentTemplates.find(t => t.id === template_id);
    if (!template) {
      throw ApiErrors.NotFound("模板不存在");
    }

    // Create agent from template
    const agentId = generateId("agent");
    const now = new Date();

    // Validate knowledge bases if provided
    if (knowledgeBases && knowledgeBases.length > 0) {
      const kbIds = knowledgeBases.map((kb: any) => kb.kbId);
      const existingKbs = await db.query.kbSpaces.findMany({
        where: eq(schema.kbSpaces.userId, userId),
        columns: { id: true }
      });
      
      const existingKbIds = existingKbs.map(kb => kb.id);
      const invalidKbIds = kbIds.filter(id => !existingKbIds.includes(id));
      
      if (invalidKbIds.length > 0) {
        throw ApiErrors.ValidationError(`知识库不存在或无访问权限: ${invalidKbIds.join(", ")}`);
      }
    }

    const [newAgent] = await db
      .insert(schema.agents)
      .values({
        id: agentId,
        userId,
        name: name || template.name,
        description: template.description || null,
        promptSystem: template.promptSystem,
        model: template.model,
        temperature: template.temperature,
        maxTokens: template.maxTokens,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    // Insert knowledge base links if provided
    if (knowledgeBases && knowledgeBases.length > 0) {
      await db
        .insert(schema.agentKbLinks)
        .values(
          knowledgeBases.map((kb: any) => ({
            id: generateId("agentKbLink"),
            agentId: agentId,
            kbId: kb.kbId,
            priority: kb.priority,
            weight: kb.weight,
            createdAt: now
          }))
        );
    }

    return c.json({
      success: true,
      data: newAgent,
      message: "从模板创建智能体成功"
    }, 201);
  }
);

// Test agent configuration
const testAgentRoute = agents.post(
  "/:agent_id/test",
  zValidator("param", z.object({
    agent_id: z.string()
  })),
  zValidator("json", z.object({
    message: z.string().min(1, "测试消息不能为空"),
    useKnowledgeBase: z.boolean().default(true)
  })),
  async (c) => {
    // TODO: 从会话中获取用户ID
    const userId = "test-user-1";
    const db = drizzle(c.env.DB, { schema });

    const { agent_id } = c.req.valid("param");
    const { message, useKnowledgeBase } = c.req.valid("json");

    // Get agent details
    const agent = await db.query.agents.findFirst({
      where: and(
        eq(schema.agents.id, agent_id),
        eq(schema.agents.userId, userId)
      )
    });

    if (!agent) {
      throw ApiErrors.NotFound("智能体不存在");
    }

    let contextInfo = "";
    let searchResults: any[] = [];

    // Search knowledge base if enabled
    if (useKnowledgeBase) {
      const knowledgeBases = await db
        .select({
          kbId: schema.agentKbLinks.kbId,
          priority: schema.agentKbLinks.priority,
          weight: schema.agentKbLinks.weight
        })
        .from(schema.agentKbLinks)
        .where(eq(schema.agentKbLinks.agentId, agent_id));

      if (knowledgeBases.length > 0) {
        const vectorManager = new VectorEmbeddingManager(c.env);
        
        // Search across all linked knowledge bases
        for (const kb of knowledgeBases) {
          try {
            const kbResults = await vectorManager.searchSimilarChunks(message, { 
              topK: 3,
              filter: {
                kbId: kb.kbId
              }
            });
            searchResults.push(...kbResults.map((result: any) => ({
              ...result,
              kbId: kb.kbId,
              priority: kb.priority,
              weight: kb.weight
            })));
          } catch (error) {
            console.warn(`Failed to search KB ${kb.kbId}:`, error);
          }
        }

        // Sort by relevance and priority
        searchResults.sort((a: any, b: any) => {
          const scoreA = a.score * (1 + a.priority * 0.1) * a.weight;
          const scoreB = b.score * (1 + b.priority * 0.1) * b.weight;
          return scoreB - scoreA;
        });

        // Limit to top 5 results
        searchResults = searchResults.slice(0, 5);

        if (searchResults.length > 0) {
          contextInfo = "\n\n相关上下文信息：\n" + 
            searchResults.map((result: any) => 
              `- ${result.content.substring(0, 200)}...`
            ).join("\n");
        }
      }
    }

    // Make AI request
    try {
      const apiKey = c.env.AIHUBMIX_API_KEY;
      if (!apiKey) {
        throw ApiErrors.InternalServerError("AI服务未配置");
      }

      const aiClient = new AIHubMixClient(apiKey);
      const response = await aiClient.createChatCompletion({
        model: agent.model,
        messages: [
          {
            role: "system",
            content: agent.promptSystem + contextInfo
          },
          {
            role: "user", 
            content: message
          }
        ],
        temperature: agent.temperature,
        max_tokens: agent.maxTokens
      });

      return c.json({
        success: true,
        data: {
          response: response.choices[0]?.message.content || "无回复",
          usage: response.usage,
          searchResults: searchResults.map((result: any) => ({
            content: result.content.substring(0, 300) + "...",
            score: result.score,
            source: result.source
          })),
          agentConfig: {
            model: agent.model,
            temperature: agent.temperature,
            maxTokens: agent.maxTokens
          }
        }
      });

    } catch (error) {
      console.error("AI request failed:", error);
      throw ApiErrors.InternalServerError("AI服务请求失败");
    }
  }
);

// Mount all routes
agents.route("/", createAgentRoute);
agents.route("/", listAgentsRoute);
agents.route("/templates", getTemplatesRoute);
agents.route("/from-template/:template_id", createFromTemplateRoute);
agents.route("/:agent_id", getAgentRoute);
agents.route("/:agent_id", updateAgentRoute);
agents.route("/:agent_id", deleteAgentRoute);
agents.route("/:agent_id/test", testAgentRoute);

export { agents };
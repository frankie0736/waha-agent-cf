import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";
import { ApiErrors } from "../../middleware/error-handler";
import { AIHubMixClient } from "../../services/aihubmix";

const aihubmix = new Hono<{ Bindings: Env }>();

// API Key validation endpoint
const validateKeyRoute = aihubmix.post(
  "/validate-key",
  zValidator(
    "json",
    z.object({
      apiKey: z.string().min(1, "API key is required"),
    })
  ),
  async (c) => {
    const { apiKey } = c.req.valid("json");

    try {
      const client = new AIHubMixClient(apiKey, {
        kv: c.env.KV,
        config: {
          maxRetries: 1, // Quick validation
          timeoutMs: 10000 // 10 second timeout
        }
      });

      const validation = await client.validateApiKey();
      
      return c.json({
        valid: validation.valid,
        error: validation.error,
        userInfo: validation.userInfo,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("API key validation error:", error);
      throw ApiErrors.InternalServerError("Failed to validate API key");
    }
  }
);

// Get available models endpoint
const getModelsRoute = aihubmix.post(
  "/models",
  zValidator(
    "json",
    z.object({
      apiKey: z.string().min(1, "API key is required"),
    })
  ),
  async (c) => {
    const { apiKey } = c.req.valid("json");

    try {
      const client = new AIHubMixClient(apiKey, {
        kv: c.env.KV
      });

      const models = await client.getModels();
      
      return c.json({
        models: models.data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Get models error:", error);
      throw ApiErrors.InternalServerError("Failed to fetch models");
    }
  }
);

// Test chat completion endpoint
const testChatRoute = aihubmix.post(
  "/test-chat",
  zValidator(
    "json",
    z.object({
      apiKey: z.string().min(1, "API key is required"),
      model: z.string().default("gpt-3.5-turbo"),
      message: z.string().min(1, "Message is required"),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(4000).optional(),
    })
  ),
  async (c) => {
    const { apiKey, model, message, temperature, maxTokens } = c.req.valid("json");

    try {
      const client = new AIHubMixClient(apiKey, {
        kv: c.env.KV
      });

      const chatRequest: any = {
        model,
        messages: [
          { role: "user", content: message }
        ],
        max_tokens: maxTokens || 150
      };
      
      if (temperature !== undefined) {
        chatRequest.temperature = temperature;
      }
      
      const response = await client.createChatCompletion(chatRequest);

      return c.json({
        response: response.choices[0]?.message?.content || "No response generated",
        model: response.model,
        usage: response.usage,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Chat completion test error:", error);
      throw ApiErrors.InternalServerError("Failed to test chat completion");
    }
  }
);

// Test embeddings endpoint
const testEmbeddingsRoute = aihubmix.post(
  "/test-embeddings",
  zValidator(
    "json",
    z.object({
      apiKey: z.string().min(1, "API key is required"),
      model: z.string().default("text-embedding-ada-002"),
      text: z.string().min(1, "Text is required"),
    })
  ),
  async (c) => {
    const { apiKey, model, text } = c.req.valid("json");

    try {
      const client = new AIHubMixClient(apiKey, {
        kv: c.env.KV
      });

      const response = await client.createEmbeddings({
        model,
        input: text
      });

      const embedding = response.data[0]?.embedding;

      return c.json({
        dimensions: embedding?.length || 0,
        preview: embedding?.slice(0, 5) || [], // Show first 5 values
        model: response.model,
        usage: response.usage,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Embeddings test error:", error);
      throw ApiErrors.InternalServerError("Failed to test embeddings");
    }
  }
);

// Get client metrics endpoint
const getMetricsRoute = aihubmix.post(
  "/metrics",
  zValidator(
    "json",
    z.object({
      apiKey: z.string().min(1, "API key is required"),
    })
  ),
  async (c) => {
    const { apiKey } = c.req.valid("json");

    try {
      const client = new AIHubMixClient(apiKey, {
        kv: c.env.KV
      });

      // Make a simple request to generate some metrics
      await client.validateApiKey();
      
      const metrics = client.getMetrics();
      
      return c.json({
        totalRequests: metrics.length,
        successfulRequests: metrics.filter(m => m.success).length,
        failedRequests: metrics.filter(m => !m.success).length,
        averageDuration: metrics.length > 0 
          ? Math.round(metrics.reduce((acc, m) => acc + m.duration, 0) / metrics.length)
          : 0,
        recentRequests: metrics.slice(-10), // Last 10 requests
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Get metrics error:", error);
      throw ApiErrors.InternalServerError("Failed to fetch metrics");
    }
  }
);

// Combined routes
const routes = aihubmix
  .route("/", validateKeyRoute)
  .route("/", getModelsRoute)
  .route("/", testChatRoute)
  .route("/", testEmbeddingsRoute)
  .route("/", getMetricsRoute);

export { routes as aihubmix };
export type AIHubMixType = typeof routes;
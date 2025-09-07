import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";
import { ApiErrors } from "../../middleware/error-handler";
import { 
  SemanticSearchService, 
  VectorEmbeddingManager
} from "../../services/vector-embedding";
import type { SemanticSearchOptions } from "../../services/vector-embedding";

const vectorSearch = new Hono<{ Bindings: Env }>();

// Search schema
const searchSchema = z.object({
  query: z.string().min(1, "Search query is required").max(1000, "Query too long"),
  kbId: z.string().optional(),
  docId: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).default(0.7),
  includeDocument: z.boolean().default(false),
  includeKnowledgeBase: z.boolean().default(false)
});

// Vector search endpoint
const searchRoute = vectorSearch.post(
  "/search",
  zValidator("json", searchSchema),
  async (c) => {
    try {
      const searchParams = c.req.valid("json");
      
      const searchService = new SemanticSearchService(c.env);
      
      const searchOptions: SemanticSearchOptions = {};
      if (searchParams.kbId) searchOptions.kbId = searchParams.kbId;
      if (searchParams.docId) searchOptions.docId = searchParams.docId;
      searchOptions.limit = searchParams.limit;
      searchOptions.threshold = searchParams.threshold;
      searchOptions.includeDocument = searchParams.includeDocument;
      searchOptions.includeKnowledgeBase = searchParams.includeKnowledgeBase;
      
      const results = await searchService.search(searchParams.query, searchOptions);
      
      return c.json({
        success: true,
        query: searchParams.query,
        results,
        count: results.length,
        searchTime: Date.now() // Simple timestamp
      });
    } catch (error) {
      console.error("Vector search failed:", error);
      throw ApiErrors.InternalServerError(
        "Search failed",
        { error: error instanceof Error ? error.message : "Unknown error" }
      );
    }
  }
);

// Search within knowledge base
const kbSearchRoute = vectorSearch.post(
  "/search/kb/:kbId",
  zValidator("param", z.object({ kbId: z.string() })),
  zValidator("json", searchSchema.omit({ kbId: true })),
  async (c) => {
    try {
      const { kbId } = c.req.valid("param");
      const searchParams = c.req.valid("json");
      
      const searchService = new SemanticSearchService(c.env);
      
      const searchOptions: Omit<SemanticSearchOptions, 'kbId'> = {};
      if (searchParams.docId) searchOptions.docId = searchParams.docId;
      searchOptions.limit = searchParams.limit;
      searchOptions.threshold = searchParams.threshold;
      searchOptions.includeDocument = searchParams.includeDocument;
      searchOptions.includeKnowledgeBase = searchParams.includeKnowledgeBase;
      
      const results = await searchService.searchWithinKnowledgeBase(
        searchParams.query,
        kbId,
        searchOptions
      );
      
      return c.json({
        success: true,
        kbId,
        query: searchParams.query,
        results,
        count: results.length
      });
    } catch (error) {
      console.error("KB search failed:", error);
      throw ApiErrors.InternalServerError(
        "Knowledge base search failed",
        { error: error instanceof Error ? error.message : "Unknown error" }
      );
    }
  }
);

// Search within document
const docSearchRoute = vectorSearch.post(
  "/search/doc/:docId",
  zValidator("param", z.object({ docId: z.string() })),
  zValidator("json", searchSchema.omit({ docId: true })),
  async (c) => {
    try {
      const { docId } = c.req.valid("param");
      const searchParams = c.req.valid("json");
      
      const searchService = new SemanticSearchService(c.env);
      
      const searchOptions: Omit<SemanticSearchOptions, 'docId'> = {};
      if (searchParams.kbId) searchOptions.kbId = searchParams.kbId;
      searchOptions.limit = searchParams.limit;
      searchOptions.threshold = searchParams.threshold;
      searchOptions.includeDocument = searchParams.includeDocument;
      searchOptions.includeKnowledgeBase = searchParams.includeKnowledgeBase;
      
      const results = await searchService.searchWithinDocument(
        searchParams.query,
        docId,
        searchOptions
      );
      
      return c.json({
        success: true,
        docId,
        query: searchParams.query,
        results,
        count: results.length
      });
    } catch (error) {
      console.error("Document search failed:", error);
      throw ApiErrors.InternalServerError(
        "Document search failed",
        { error: error instanceof Error ? error.message : "Unknown error" }
      );
    }
  }
);

// Find similar chunks
const similarRoute = vectorSearch.get(
  "/similar/:chunkId",
  zValidator("param", z.object({ chunkId: z.string() })),
  zValidator("query", z.object({
    limit: z.string().transform(val => parseInt(val)).refine(val => val >= 1 && val <= 20).default(5),
    threshold: z.string().transform(val => parseFloat(val)).refine(val => val >= 0 && val <= 1).default(0.7),
    includeDocument: z.string().transform(val => val === "true").default(false),
    includeKnowledgeBase: z.string().transform(val => val === "true").default(false)
  })),
  async (c) => {
    try {
      const { chunkId } = c.req.valid("param");
      const params = c.req.valid("query");
      
      const searchService = new SemanticSearchService(c.env);
      
      const results = await searchService.findSimilarChunks(chunkId, {
        limit: params.limit,
        threshold: params.threshold,
        includeDocument: params.includeDocument,
        includeKnowledgeBase: params.includeKnowledgeBase
      });
      
      return c.json({
        success: true,
        chunkId,
        results,
        count: results.length
      });
    } catch (error) {
      console.error("Similar chunks search failed:", error);
      throw ApiErrors.InternalServerError(
        "Similar chunks search failed",
        { error: error instanceof Error ? error.message : "Unknown error" }
      );
    }
  }
);

// Get recommendations for a knowledge base
const recommendationsRoute = vectorSearch.get(
  "/recommendations/:kbId",
  zValidator("param", z.object({ kbId: z.string() })),
  zValidator("query", z.object({
    limit: z.string().transform(val => parseInt(val)).refine(val => val >= 1 && val <= 10).default(5)
  })),
  async (c) => {
    try {
      const { kbId } = c.req.valid("param");
      const { limit } = c.req.valid("query");
      
      const searchService = new SemanticSearchService(c.env);
      
      const results = await searchService.getRecommendations(kbId, limit);
      
      return c.json({
        success: true,
        kbId,
        recommendations: results,
        count: results.length
      });
    } catch (error) {
      console.error("Recommendations failed:", error);
      throw ApiErrors.InternalServerError(
        "Recommendations failed",
        { error: error instanceof Error ? error.message : "Unknown error" }
      );
    }
  }
);

// Get vector index statistics
const statsRoute = vectorSearch.get(
  "/stats",
  async (c) => {
    try {
      const vectorManager = new VectorEmbeddingManager(c.env);
      const stats = await vectorManager.getIndexStats();
      
      return c.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error("Stats retrieval failed:", error);
      throw ApiErrors.InternalServerError(
        "Failed to retrieve vector index stats",
        { error: error instanceof Error ? error.message : "Unknown error" }
      );
    }
  }
);

// Reprocess failed chunks
const reprocessRoute = vectorSearch.post(
  "/reprocess",
  zValidator("json", z.object({
    kbId: z.string().optional(),
    docId: z.string().optional()
  })),
  async (c) => {
    try {
      const { kbId, docId } = c.req.valid("json");
      
      if (!kbId && !docId) {
        throw ApiErrors.ValidationError("Either kbId or docId must be provided");
      }
      
      const vectorManager = new VectorEmbeddingManager(c.env);
      const result = await vectorManager.reprocessFailedChunks(kbId, docId);
      
      return c.json({
        success: true,
        result
      });
    } catch (error) {
      console.error("Reprocessing failed:", error);
      throw ApiErrors.InternalServerError(
        "Failed to reprocess chunks",
        { error: error instanceof Error ? error.message : "Unknown error" }
      );
    }
  }
);

// Export route configuration
export { vectorSearch };
export default vectorSearch;
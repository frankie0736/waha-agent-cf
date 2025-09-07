import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WebScraper } from '../../services/web-scraper';
import { ApiErrors } from '../../middleware/error-handler';
import type { Env } from '../../types';

const app = new Hono<{ Bindings: Env }>();

// Validation schemas
const crawlOptionsSchema = z.object({
  maxPages: z.number().int().min(1).max(1000).optional(),
  maxDepth: z.number().int().min(1).max(5).optional(),
  respectRobotsTxt: z.boolean().optional().default(true),
  followExternalLinks: z.boolean().optional().default(false),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  requestDelay: z.number().int().min(100).max(10000).optional(),
  timeout: z.number().int().min(5000).max(60000).optional(),
  retryAttempts: z.number().int().min(0).max(5).optional(),
  extractImages: z.boolean().optional().default(false),
  extractLinks: z.boolean().optional().default(false),
  cleanContent: z.boolean().optional().default(true),
  minContentLength: z.number().int().min(10).max(10000).optional(),
  maxContentLength: z.number().int().min(100).max(1000000).optional(),
});

const singleUrlSchema = z.object({
  url: z.string().url('Invalid URL format'),
  kbId: z.string().min(1, 'Knowledge base ID is required'),
  options: crawlOptionsSchema.optional()
});

const sitemapSchema = z.object({
  sitemapUrl: z.string().url('Invalid sitemap URL format'),
  kbId: z.string().min(1, 'Knowledge base ID is required'),
  options: crawlOptionsSchema.optional()
});

const batchSchema = z.object({
  urls: z.array(z.string().url()).min(1, 'At least one URL is required').max(100, 'Maximum 100 URLs allowed'),
  kbId: z.string().min(1, 'Knowledge base ID is required'),
  options: crawlOptionsSchema.optional()
});

const domainSchema = z.object({
  baseUrl: z.string().url('Invalid base URL format'),
  kbId: z.string().min(1, 'Knowledge base ID is required'),
  options: crawlOptionsSchema.optional()
});

/**
 * Scrape a single URL and add to knowledge base
 */
app.post(
  '/single',
  zValidator('json', singleUrlSchema),
  async (c) => {
    try {
      const { url, kbId, options } = c.req.valid('json');
      const db = c.env.DB;

      // Verify knowledge base exists and user has access
      const kb = await db.prepare(`
        SELECT id, user_id FROM kb_spaces WHERE id = ?
      `).bind(kbId).first();

      if (!kb) {
        throw ApiErrors.NotFound('Knowledge base not found');
      }

      // TODO: Add user authentication and authorization check
      // For now, we'll skip the user check

      const scraper = new WebScraper();
      const result = await scraper.crawlSingleUrl(url, kbId, options);

      return c.json({
        success: result.success,
        message: result.success 
          ? `Successfully scraped URL and created ${result.chunksCreated} chunks` 
          : 'Failed to scrape URL',
        result: {
          documentsCreated: result.documentsCreated,
          chunksCreated: result.chunksCreated,
          processingTime: result.processingTime,
          error: result.error
        }
      });

    } catch (error) {
      console.error('Single URL scraping error:', error);
      if (error instanceof Error && error.name === 'ApiError') {
        throw error;
      }
      throw ApiErrors.InternalServerError('Failed to scrape URL', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Scrape URLs from a sitemap
 */
app.post(
  '/sitemap',
  zValidator('json', sitemapSchema),
  async (c) => {
    try {
      const { sitemapUrl, kbId, options } = c.req.valid('json');
      const db = c.env.DB;

      // Verify knowledge base exists
      const kb = await db.prepare(`
        SELECT id, user_id FROM kb_spaces WHERE id = ?
      `).bind(kbId).first();

      if (!kb) {
        throw ApiErrors.NotFound('Knowledge base not found');
      }

      const scraper = new WebScraper();
      const result = await scraper.crawlSitemap(sitemapUrl, kbId, options);

      return c.json({
        success: result.success,
        message: result.success 
          ? `Successfully scraped sitemap and created ${result.documentsCreated} documents with ${result.chunksCreated} chunks` 
          : 'Failed to scrape sitemap',
        result: {
          documentsCreated: result.documentsCreated,
          chunksCreated: result.chunksCreated,
          processingTime: result.processingTime,
          error: result.error
        }
      });

    } catch (error) {
      console.error('Sitemap scraping error:', error);
      if (error instanceof Error && error.name === 'ApiError') {
        throw error;
      }
      throw ApiErrors.InternalServerError('Failed to scrape sitemap', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Scrape multiple URLs in batch
 */
app.post(
  '/batch',
  zValidator('json', batchSchema),
  async (c) => {
    try {
      const { urls, kbId, options } = c.req.valid('json');
      const db = c.env.DB;

      // Verify knowledge base exists
      const kb = await db.prepare(`
        SELECT id, user_id FROM kb_spaces WHERE id = ?
      `).bind(kbId).first();

      if (!kb) {
        throw ApiErrors.NotFound('Knowledge base not found');
      }

      const scraper = new WebScraper();
      const result = await scraper.crawlBatch(urls, kbId, options);

      return c.json({
        success: result.success,
        message: result.success 
          ? `Successfully scraped ${result.documentsCreated} URLs and created ${result.chunksCreated} chunks` 
          : 'Failed to scrape URLs',
        result: {
          documentsCreated: result.documentsCreated,
          chunksCreated: result.chunksCreated,
          processingTime: result.processingTime,
          error: result.error
        }
      });

    } catch (error) {
      console.error('Batch scraping error:', error);
      if (error instanceof Error && error.name === 'ApiError') {
        throw error;
      }
      throw ApiErrors.InternalServerError('Failed to scrape URLs', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Auto-discover and scrape a domain's sitemaps
 */
app.post(
  '/domain',
  zValidator('json', domainSchema),
  async (c) => {
    try {
      const { baseUrl, kbId, options } = c.req.valid('json');
      const db = c.env.DB;

      // Verify knowledge base exists
      const kb = await db.prepare(`
        SELECT id, user_id FROM kb_spaces WHERE id = ?
      `).bind(kbId).first();

      if (!kb) {
        throw ApiErrors.NotFound('Knowledge base not found');
      }

      const scraper = new WebScraper();
      const result = await scraper.crawlDomain(baseUrl, kbId, options);

      return c.json({
        success: result.success,
        message: result.success 
          ? `Successfully scraped domain and created ${result.documentsCreated} documents with ${result.chunksCreated} chunks` 
          : 'Failed to scrape domain',
        result: {
          documentsCreated: result.documentsCreated,
          chunksCreated: result.chunksCreated,
          processingTime: result.processingTime,
          error: result.error
        }
      });

    } catch (error) {
      console.error('Domain scraping error:', error);
      if (error instanceof Error && error.name === 'ApiError') {
        throw error;
      }
      throw ApiErrors.InternalServerError('Failed to scrape domain', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Get supported crawling options and limits
 */
app.get('/options', async (c) => {
  return c.json({
    options: {
      maxPages: { min: 1, max: 1000, default: 100 },
      maxDepth: { min: 1, max: 5, default: 3 },
      requestDelay: { min: 100, max: 10000, default: 1000 },
      timeout: { min: 5000, max: 60000, default: 30000 },
      retryAttempts: { min: 0, max: 5, default: 3 },
      minContentLength: { min: 10, max: 10000, default: 100 },
      maxContentLength: { min: 100, max: 1000000, default: 500000 }
    },
    limits: {
      maxUrlsPerBatch: 100,
      maxConcurrentRequests: 3,
      maxContentSize: 5 * 1024 * 1024, // 5MB
    },
    supportedContentTypes: [
      'text/html',
      'text/plain', 
      'text/markdown',
      'application/xml',
      'application/rss+xml',
      'application/atom+xml'
    ]
  });
});

export default app;
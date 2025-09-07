import { SingleUrlScraper } from './single-url-scraper';
import { SitemapParser } from './sitemap-parser';
import type { 
  CrawlTask, 
  CrawlOptions, 
  CrawlResult, 
  CrawledUrl,
  WebScraperConfig,
  ProcessingResult
} from './types';
import { DocumentChunker } from '../document-processor';
import type { D1Database } from '@cloudflare/workers-types';

export class WebScraper {
  private readonly singleScraper: SingleUrlScraper;
  private readonly sitemapParser: SitemapParser;
  private readonly documentChunker: DocumentChunker;
  private readonly config: WebScraperConfig;

  constructor(config: Partial<WebScraperConfig> = {}) {
    this.config = {
      maxConcurrentRequests: 3,
      requestTimeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      userAgent: 'WA-Agent/1.0 (+https://wa-agent.com)',
      respectRobotsTxt: true,
      defaultDelay: 1000,
      maxContentSize: 5 * 1024 * 1024, // 5MB
      ...config
    };

    this.singleScraper = new SingleUrlScraper(this.config);
    this.sitemapParser = new SitemapParser();
    this.documentChunker = new DocumentChunker({
      maxChunkSize: 1000,
      overlapSize: 200,
      preserveParagraphs: true,
      minChunkSize: 50,
    });
  }

  /**
   * Crawl a single URL
   */
  async crawlSingleUrl(
    url: string, 
    kbId: string, 
    options: CrawlOptions = {}
  ): Promise<ProcessingResult> {
    const taskId = this.generateTaskId();
    const startTime = Date.now();

    try {
      // Scrape the URL
      const crawledUrl = await this.singleScraper.scrapeUrl(url, taskId, options);
      
      // Create a virtual document for the content
      const document = {
        id: this.generateDocId(),
        filename: this.getFilenameFromUrl(url),
        content: crawledUrl.content,
        chunks: [],
        metadata: {
          pageCount: 1,
          wordCount: crawledUrl.content.split(/\\s+/).length,
          extractedAt: crawledUrl.extractedAt,
          url: crawledUrl.url,
          title: crawledUrl.title,
          contentType: crawledUrl.contentType,
          lastModified: crawledUrl.lastModified
        }
      };

      // Process the document into chunks
      const chunks = this.documentChunker.chunkDocument(
        document.content,
        document.id,
        kbId
      );

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        documentsCreated: 1,
        chunksCreated: chunks.length,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      return {
        success: false,
        documentsCreated: 0,
        chunksCreated: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      };
    }
  }

  /**
   * Crawl URLs from a sitemap
   */
  async crawlSitemap(
    sitemapUrl: string,
    kbId: string,
    options: CrawlOptions = {}
  ): Promise<ProcessingResult> {
    const taskId = this.generateTaskId();
    const startTime = Date.now();

    try {
      // Parse sitemap to get URLs
      const sitemapEntries = await this.sitemapParser.parseSitemap(sitemapUrl);
      
      // Filter entries based on options
      const filterOptions: {
        includePatterns?: string[] | undefined;
        excludePatterns?: string[] | undefined;
      } = {};
      
      if (options.includePatterns !== undefined) {
        filterOptions.includePatterns = options.includePatterns;
      }
      if (options.excludePatterns !== undefined) {
        filterOptions.excludePatterns = options.excludePatterns;
      }
      
      const filteredEntries = this.sitemapParser.filterEntries(sitemapEntries, filterOptions as any);

      // Sort by priority
      const sortedEntries = this.sitemapParser.sortEntries(filteredEntries, 'priority');
      
      // Limit number of URLs to crawl
      const maxPages = options.maxPages || 100;
      const urlsToCrawl = sortedEntries.slice(0, maxPages);

      let successfulCrawls = 0;
      let totalChunks = 0;
      const errors: string[] = [];

      // Process URLs with concurrency control
      const concurrency = Math.min(this.config.maxConcurrentRequests, 3);
      
      for (let i = 0; i < urlsToCrawl.length; i += concurrency) {
        const batch = urlsToCrawl.slice(i, i + concurrency);
        
        const batchPromises = batch.map(async (entry) => {
          try {
            // Add delay between requests
            if (i > 0) {
              await this.delay(options.requestDelay || this.config.defaultDelay);
            }

            const result = await this.crawlSingleUrl(entry.url, kbId, options);
            
            if (result.success) {
              successfulCrawls++;
              totalChunks += result.chunksCreated;
            } else {
              errors.push(`${entry.url}: ${result.error}`);
            }
            
            return result;
          } catch (error) {
            errors.push(`${entry.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
              success: false,
              documentsCreated: 0,
              chunksCreated: 0,
              error: error instanceof Error ? error.message : 'Unknown error',
              processingTime: 0
            };
          }
        });

        await Promise.all(batchPromises);
      }

      const processingTime = Date.now() - startTime;

      return {
        success: successfulCrawls > 0,
        documentsCreated: successfulCrawls,
        chunksCreated: totalChunks,
        error: errors.length > 0 ? `Some URLs failed: ${errors.slice(0, 5).join('; ')}` : undefined,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      return {
        success: false,
        documentsCreated: 0,
        chunksCreated: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      };
    }
  }

  /**
   * Crawl multiple URLs in batch
   */
  async crawlBatch(
    urls: string[],
    kbId: string,
    options: CrawlOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      let successfulCrawls = 0;
      let totalChunks = 0;
      const errors: string[] = [];

      // Limit number of URLs
      const maxPages = options.maxPages || 50;
      const urlsToCrawl = urls.slice(0, maxPages);

      // Process URLs with concurrency control
      const concurrency = Math.min(this.config.maxConcurrentRequests, 3);
      
      for (let i = 0; i < urlsToCrawl.length; i += concurrency) {
        const batch = urlsToCrawl.slice(i, i + concurrency);
        
        const batchPromises = batch.map(async (url) => {
          try {
            // Add delay between requests
            if (i > 0) {
              await this.delay(options.requestDelay || this.config.defaultDelay);
            }

            const result = await this.crawlSingleUrl(url, kbId, options);
            
            if (result.success) {
              successfulCrawls++;
              totalChunks += result.chunksCreated;
            } else {
              errors.push(`${url}: ${result.error}`);
            }
            
            return result;
          } catch (error) {
            errors.push(`${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
              success: false,
              documentsCreated: 0,
              chunksCreated: 0,
              error: error instanceof Error ? error.message : 'Unknown error',
              processingTime: 0
            };
          }
        });

        await Promise.all(batchPromises);
      }

      const processingTime = Date.now() - startTime;

      return {
        success: successfulCrawls > 0,
        documentsCreated: successfulCrawls,
        chunksCreated: totalChunks,
        error: errors.length > 0 ? `Some URLs failed: ${errors.slice(0, 5).join('; ')}` : undefined,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      return {
        success: false,
        documentsCreated: 0,
        chunksCreated: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      };
    }
  }

  /**
   * Auto-discover and crawl sitemaps for a domain
   */
  async crawlDomain(
    baseUrl: string,
    kbId: string,
    options: CrawlOptions = {}
  ): Promise<ProcessingResult> {
    try {
      // Find sitemaps for the domain
      const sitemapUrls = await this.sitemapParser.findSitemaps(baseUrl);
      
      if (sitemapUrls.length === 0) {
        // If no sitemaps found, just crawl the base URL
        return await this.crawlSingleUrl(baseUrl, kbId, options);
      }

      // Process all found sitemaps
      let totalSuccess = 0;
      let totalChunks = 0;
      const errors: string[] = [];
      let totalTime = 0;

      for (const sitemapUrl of sitemapUrls.slice(0, 3)) { // Limit to 3 sitemaps
        const result = await this.crawlSitemap(sitemapUrl, kbId, options);
        
        totalSuccess += result.documentsCreated;
        totalChunks += result.chunksCreated;
        totalTime += result.processingTime;
        
        if (result.error) {
          errors.push(result.error);
        }
      }

      return {
        success: totalSuccess > 0,
        documentsCreated: totalSuccess,
        chunksCreated: totalChunks,
        error: errors.length > 0 ? errors.join('; ') : undefined,
        processingTime: totalTime
      };

    } catch (error) {
      return {
        success: false,
        documentsCreated: 0,
        chunksCreated: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0
      };
    }
  }

  /**
   * Store crawled content in database
   */
  async storeContent(
    crawledUrls: CrawledUrl[],
    kbId: string,
    db: D1Database
  ): Promise<void> {
    try {
      for (const crawledUrl of crawledUrls) {
        // Create document record
        const docId = this.generateDocId();
        const filename = this.getFilenameFromUrl(crawledUrl.url);
        
        // Insert document
        await db.prepare(`
          INSERT INTO kb_documents (id, kb_id, filename, filetype, filesize, r2_key, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          docId,
          kbId,
          filename,
          'text/html',
          crawledUrl.contentLength,
          `web/${docId}`, // Virtual R2 key for web content
          'completed',
          Date.now(),
          Date.now()
        ).run();

        // Create chunks
        const chunks = this.documentChunker.chunkDocument(
          crawledUrl.content,
          docId,
          kbId
        );

        // Insert chunks
        for (const chunk of chunks) {
          await db.prepare(`
            INSERT INTO kb_chunks (id, kb_id, doc_id, chunk_index, text, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            chunk.id,
            chunk.kbId,
            chunk.docId,
            chunk.chunkIndex,
            chunk.text,
            chunk.createdAt.getTime()
          ).run();
        }
      }
    } catch (error) {
      throw new Error(`Failed to store crawled content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateDocId(): string {
    return `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getFilenameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart && lastPart.includes('.')) {
          return lastPart;
        }
        return `${lastPart || 'index'}.html`;
      }
      
      return `${urlObj.hostname}.html`;
    } catch {
      return 'scraped_content.html';
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
export interface CrawlTask {
  id: string;
  kbId: string;
  url: string;
  type: 'single' | 'sitemap' | 'batch';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  options: CrawlOptions;
  progress?: {
    totalUrls?: number;
    processedUrls: number;
    failedUrls: number;
    successfulUrls: number;
    startedAt: Date;
    estimatedCompletionAt?: Date;
  };
  result?: CrawlResult;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CrawlOptions {
  maxPages?: number | undefined;
  maxDepth?: number | undefined;
  respectRobotsTxt?: boolean | undefined;
  followExternalLinks?: boolean | undefined;
  includePatterns?: string[] | undefined;
  excludePatterns?: string[] | undefined;
  requestDelay?: number | undefined;
  timeout?: number | undefined;
  retryAttempts?: number | undefined;
  extractImages?: boolean | undefined;
  extractLinks?: boolean | undefined;
  cleanContent?: boolean | undefined;
  minContentLength?: number | undefined;
  maxContentLength?: number | undefined;
}

export interface CrawlResult {
  totalUrls: number;
  successfulUrls: number;
  failedUrls: number;
  totalContent: number;
  processingTime: number;
  urls: CrawledUrl[];
}

export interface CrawledUrl {
  id: string;
  taskId: string;
  url: string;
  title: string;
  content: string;
  contentType: string;
  contentLength: number;
  statusCode: number;
  lastModified?: Date | undefined;
  extractedAt: Date;
  metadata?: {
    description?: string;
    keywords?: string[];
    author?: string;
    publishedDate?: Date;
    images?: string[];
    links?: string[];
    headings?: string[];
  } | undefined;
}

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export interface WebContentExtractor {
  extractContent(html: string, url: string): Promise<ExtractedContent>;
  cleanText(text: string): string;
  extractMetadata(document: any, html: string): ContentMetadata;
}

export interface ExtractedContent {
  title: string;
  content: string;
  metadata: ContentMetadata;
}

export interface ContentMetadata {
  description?: string;
  keywords?: string[];
  author?: string;
  publishedDate?: Date;
  images?: string[];
  links?: string[];
  headings?: string[];
}

export interface CrawlQueue {
  add(urls: string | string[], options?: CrawlOptions): Promise<void>;
  process(): Promise<void>;
  getStatus(): Promise<QueueStatus>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  clear(): Promise<void>;
}

export interface QueueStatus {
  totalJobs: number;
  activeJobs: number;
  waitingJobs: number;
  completedJobs: number;
  failedJobs: number;
  isPaused: boolean;
}

export interface RateLimiter {
  acquire(url: string): Promise<void>;
  release(url: string): void;
  getDelay(url: string): number;
  reset(): void;
}

export interface ContentDeduplicator {
  isDuplicate(content: string, url: string): Promise<boolean>;
  addContent(content: string, url: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<{ totalContent: number; duplicates: number }>;
}

export type SupportedContentType = 
  | 'text/html'
  | 'text/plain' 
  | 'text/markdown'
  | 'application/xml'
  | 'application/rss+xml'
  | 'application/atom+xml';

export interface WebScraperConfig {
  maxConcurrentRequests: number;
  requestTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  userAgent: string;
  respectRobotsTxt: boolean;
  defaultDelay: number;
  maxContentSize: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
}

export interface ProcessingResult {
  success: boolean;
  documentsCreated: number;
  chunksCreated: number;
  error?: string | undefined;
  processingTime: number;
}
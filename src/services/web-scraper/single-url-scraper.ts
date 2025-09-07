import { HTMLContentExtractor } from './content-extractor';
import type { CrawlOptions, CrawledUrl, WebScraperConfig, SupportedContentType } from './types';

export class SingleUrlScraper {
  private readonly extractor: HTMLContentExtractor;
  private readonly config: WebScraperConfig;

  constructor(config: Partial<WebScraperConfig> = {}) {
    this.extractor = new HTMLContentExtractor();
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
  }

  async scrapeUrl(url: string, taskId: string, options: CrawlOptions = {}): Promise<CrawledUrl> {
    const startTime = Date.now();
    
    try {
      // Validate URL
      const validatedUrl = this.validateUrl(url);
      
      // Check robots.txt if enabled
      if (this.config.respectRobotsTxt && options.respectRobotsTxt !== false) {
        await this.checkRobotsTxt(validatedUrl);
      }

      // Fetch content with retries
      const response = await this.fetchWithRetries(validatedUrl, options);
      
      // Validate content type
      const contentType = this.getContentType(response);
      if (!this.isSupportedContentType(contentType)) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      // Extract content based on type
      let extractedContent;
      const responseText = await response.text();
      
      if (contentType === 'text/html') {
        extractedContent = await this.extractor.extractContent(responseText, validatedUrl);
      } else {
        // Handle plain text, markdown, XML, etc.
        extractedContent = {
          title: this.extractTitleFromUrl(validatedUrl),
          content: responseText,
          metadata: {}
        };
      }

      // Apply content filtering
      const filteredContent = this.filterContent(extractedContent.content, options);
      
      if (!filteredContent || filteredContent.length < (options.minContentLength || 100)) {
        throw new Error('Content too short after filtering');
      }

      if (filteredContent.length > (options.maxContentLength || 500000)) {
        throw new Error('Content too long');
      }

      const processingTime = Date.now() - startTime;

      return {
        id: this.generateId(),
        taskId,
        url: validatedUrl,
        title: extractedContent.title,
        content: filteredContent,
        contentType,
        contentLength: filteredContent.length,
        statusCode: response.status,
        lastModified: this.getLastModified(response),
        extractedAt: new Date(),
        metadata: extractedContent.metadata
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      throw new Error(`Failed to scrape ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported');
      }

      // Check blocked domains
      if (this.config.blockedDomains?.some(domain => urlObj.hostname.includes(domain))) {
        throw new Error(`Domain ${urlObj.hostname} is blocked`);
      }

      // Check allowed domains
      if (this.config.allowedDomains && !this.config.allowedDomains.some(domain => urlObj.hostname.includes(domain))) {
        throw new Error(`Domain ${urlObj.hostname} is not in allowed list`);
      }

      return urlObj.toString();
    } catch (error) {
      throw new Error(`Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async checkRobotsTxt(url: string): Promise<void> {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
      
      const response = await fetch(robotsUrl, {
        method: 'GET',
        headers: {
          'User-Agent': this.config.userAgent,
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (response.ok) {
        const robotsText = await response.text();
        
        // Simple robots.txt parsing - check for disallow rules
        const lines = robotsText.split('\\n');
        let isRelevantSection = false;
        
        for (const line of lines) {
          const trimmedLine = line.trim().toLowerCase();
          
          if (trimmedLine.startsWith('user-agent:')) {
            const userAgent = trimmedLine.split(':')[1]?.trim();
            isRelevantSection = userAgent === '*' || (userAgent !== undefined && this.config.userAgent.toLowerCase().includes(userAgent));
          } else if (isRelevantSection && trimmedLine.startsWith('disallow:')) {
            const disallowPath = trimmedLine.split(':')[1]?.trim();
            if (disallowPath && urlObj.pathname.startsWith(disallowPath)) {
              throw new Error(`URL blocked by robots.txt: ${disallowPath}`);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Could not check robots.txt:', error);
      // Don't fail the request if robots.txt check fails
    }
  }

  private async fetchWithRetries(url: string, options: CrawlOptions): Promise<Response> {
    const maxRetries = Math.min(options.retryAttempts || this.config.retryAttempts, 5);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Wait before retry
          const delay = (options.requestDelay || this.config.retryDelay) * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, Math.min(delay, 10000)));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.config.requestTimeout);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': this.config.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain,text/markdown;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Check content size
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > this.config.maxContentSize) {
          throw new Error(`Content too large: ${contentLength} bytes`);
        }

        return response;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown fetch error');
        
        if (attempt === maxRetries) {
          break;
        }

        // Don't retry certain errors
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            lastError = new Error('Request timeout');
            break;
          }
          
          if (error.message.includes('HTTP 4')) {
            // Don't retry client errors
            break;
          }
        }
      }
    }

    throw lastError || new Error('Failed to fetch after retries');
  }

  private getContentType(response: Response): SupportedContentType {
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/html')) return 'text/html';
    if (contentType.includes('text/plain')) return 'text/plain';
    if (contentType.includes('text/markdown')) return 'text/markdown';
    if (contentType.includes('application/xml') || contentType.includes('text/xml')) return 'application/xml';
    if (contentType.includes('application/rss+xml')) return 'application/rss+xml';
    if (contentType.includes('application/atom+xml')) return 'application/atom+xml';
    
    // Default to HTML for unknown types
    return 'text/html';
  }

  private isSupportedContentType(contentType: string): contentType is SupportedContentType {
    const supported: SupportedContentType[] = [
      'text/html', 'text/plain', 'text/markdown', 
      'application/xml', 'application/rss+xml', 'application/atom+xml'
    ];
    return supported.includes(contentType as SupportedContentType);
  }

  private filterContent(content: string, options: CrawlOptions): string {
    if (!options.cleanContent) {
      return content;
    }

    let filtered = content;

    // Apply include patterns
    if (options.includePatterns?.length) {
      const includeRegex = new RegExp(options.includePatterns.join('|'), 'gi');
      const matches = content.match(includeRegex);
      if (matches) {
        filtered = matches.join(' ');
      } else {
        return ''; // No matches found
      }
    }

    // Apply exclude patterns
    if (options.excludePatterns?.length) {
      const excludeRegex = new RegExp(options.excludePatterns.join('|'), 'gi');
      filtered = filtered.replace(excludeRegex, '');
    }

    return this.extractor.cleanText(filtered);
  }

  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart) {
          return lastPart.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, ''); // Remove extension
        }
      }
      
      return urlObj.hostname;
    } catch {
      return 'Untitled';
    }
  }

  private getLastModified(response: Response): Date | undefined {
    const lastModified = response.headers.get('last-modified');
    if (lastModified) {
      const date = new Date(lastModified);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return undefined;
  }

  private generateId(): string {
    return `url_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
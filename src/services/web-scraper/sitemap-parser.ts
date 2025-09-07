import { XMLParser } from 'fast-xml-parser';
import type { SitemapEntry } from './types';

export class SitemapParser {
  private readonly parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      parseAttributeValue: true,
      trimValues: true,
      parseTrueNumberOnly: false,
      arrayMode: false,
      attributeNamePrefix: '@',
    } as any);
  }

  async parseSitemap(url: string): Promise<SitemapEntry[]> {
    try {
      const response = await this.fetchSitemap(url);
      const xmlContent = await response.text();
      
      // Parse XML
      const parsed = this.parser.parse(xmlContent);
      
      // Handle different sitemap formats
      if (parsed.sitemapindex) {
        // Sitemap index - contains references to other sitemaps
        return await this.parseSitemapIndex(parsed.sitemapindex);
      } else if (parsed.urlset) {
        // Regular sitemap
        return this.parseUrlSet(parsed.urlset);
      } else {
        // Try to detect other common formats
        const rootKeys = Object.keys(parsed);
        for (const key of rootKeys) {
          if (key.toLowerCase().includes('sitemap') || key.toLowerCase().includes('urlset')) {
            return this.parseGenericSitemap(parsed[key]);
          }
        }
        
        throw new Error('Unrecognized sitemap format');
      }
    } catch (error) {
      throw new Error(`Failed to parse sitemap ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findSitemaps(baseUrl: string): Promise<string[]> {
    const sitemapUrls: string[] = [];
    
    try {
      const urlObj = new URL(baseUrl);
      const baseHost = `${urlObj.protocol}//${urlObj.host}`;
      
      // Common sitemap locations
      const commonLocations = [
        '/sitemap.xml',
        '/sitemap_index.xml', 
        '/sitemaps/sitemap.xml',
        '/sitemaps.xml',
        '/sitemap1.xml'
      ];

      // Check robots.txt for sitemap references
      try {
        const robotsUrl = `${baseHost}/robots.txt`;
        const robotsResponse = await fetch(robotsUrl, {
          headers: { 'User-Agent': 'WA-Agent/1.0' }
        });
        
        if (robotsResponse.ok) {
          const robotsText = await robotsResponse.text();
          const sitemapMatches = robotsText.match(/sitemap:\\s*(.+)/gi);
          
          if (sitemapMatches) {
            for (const match of sitemapMatches) {
              const sitemapUrl = match.split(':')[1]?.trim();
              if (sitemapUrl) {
                sitemapUrls.push(sitemapUrl);
              }
            }
          }
        }
      } catch (error) {
        console.warn('Could not check robots.txt for sitemaps:', error);
      }

      // Check common locations
      for (const location of commonLocations) {
        const sitemapUrl = `${baseHost}${location}`;
        if (!sitemapUrls.includes(sitemapUrl)) {
          try {
            const response = await fetch(sitemapUrl, {
              method: 'HEAD',
              headers: { 'User-Agent': 'WA-Agent/1.0' }
            });
            
            if (response.ok) {
              sitemapUrls.push(sitemapUrl);
            }
          } catch (error) {
            // Ignore failed requests for sitemap discovery
            continue;
          }
        }
      }

      return sitemapUrls;
    } catch (error) {
      console.error('Error finding sitemaps:', error);
      return sitemapUrls;
    }
  }

  private async fetchSitemap(url: string): Promise<Response> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'WA-Agent/1.0',
        'Accept': 'application/xml,text/xml,*/*'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('xml') && !contentType.includes('text')) {
      throw new Error(`Invalid content type for sitemap: ${contentType}`);
    }

    return response;
  }

  private async parseSitemapIndex(sitemapIndex: any): Promise<SitemapEntry[]> {
    const allEntries: SitemapEntry[] = [];
    let sitemaps = sitemapIndex.sitemap;
    
    // Ensure we have an array
    if (!Array.isArray(sitemaps)) {
      sitemaps = [sitemaps];
    }

    // Process each sitemap (limit to prevent abuse)
    const maxSitemaps = 20;
    const sitemapsToProcess = sitemaps.slice(0, maxSitemaps);

    for (const sitemap of sitemapsToProcess) {
      if (sitemap.loc) {
        try {
          const entries = await this.parseSitemap(sitemap.loc);
          allEntries.push(...entries);
          
          // Limit total entries to prevent memory issues
          if (allEntries.length > 10000) {
            console.warn('Sitemap too large, limiting to 10000 entries');
            break;
          }
        } catch (error) {
          console.error(`Failed to parse nested sitemap ${sitemap.loc}:`, error);
          continue;
        }
      }
    }

    return allEntries;
  }

  private parseUrlSet(urlset: any): SitemapEntry[] {
    let urls = urlset.url;
    
    // Ensure we have an array
    if (!Array.isArray(urls)) {
      urls = [urls];
    }

    return urls.map((url: any): SitemapEntry => {
      const entry: SitemapEntry = {
        url: url.loc || url.url || url
      };

      // Parse optional fields
      if (url.lastmod) {
        const lastMod = new Date(url.lastmod);
        if (!isNaN(lastMod.getTime())) {
          entry.lastModified = lastMod;
        }
      }

      if (url.changefreq) {
        const freq = url.changefreq.toLowerCase();
        if (['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].includes(freq)) {
          entry.changeFrequency = freq as any;
        }
      }

      if (url.priority) {
        const priority = parseFloat(url.priority);
        if (!isNaN(priority) && priority >= 0 && priority <= 1) {
          entry.priority = priority;
        }
      }

      return entry;
    }).filter((entry: SitemapEntry) => entry.url && this.isValidUrl(entry.url));
  }

  private parseGenericSitemap(sitemapData: any): SitemapEntry[] {
    const entries: SitemapEntry[] = [];

    // Try to find URL entries in various formats
    const urlFields = ['url', 'loc', 'link', 'href'];
    
    const processItem = (item: any) => {
      let url: string | undefined;
      
      // Find URL field
      for (const field of urlFields) {
        if (item[field]) {
          url = typeof item[field] === 'string' ? item[field] : item[field].loc || item[field].url;
          break;
        }
      }

      if (url && this.isValidUrl(url)) {
        const entry: SitemapEntry = { url };

        // Try to extract metadata
        if (item.lastmod || item.lastModified) {
          const lastMod = new Date(item.lastmod || item.lastModified);
          if (!isNaN(lastMod.getTime())) {
            entry.lastModified = lastMod;
          }
        }

        entries.push(entry);
      }
    };

    // Process the sitemap data
    if (Array.isArray(sitemapData)) {
      sitemapData.forEach(processItem);
    } else if (typeof sitemapData === 'object') {
      // Look for arrays within the object
      for (const key of Object.keys(sitemapData)) {
        const value = sitemapData[key];
        if (Array.isArray(value)) {
          value.forEach(processItem);
        } else if (typeof value === 'object') {
          processItem(value);
        }
      }
    }

    return entries;
  }

  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  }

  // Utility method to filter sitemap entries based on criteria
  filterEntries(entries: SitemapEntry[], options: {
    includePatterns?: string[];
    excludePatterns?: string[];
    maxAge?: number; // Days
    minPriority?: number;
    changeFrequency?: SitemapEntry['changeFrequency'][];
  }): SitemapEntry[] {
    return entries.filter(entry => {
      // Check include patterns
      if (options.includePatterns?.length) {
        const includeRegex = new RegExp(options.includePatterns.join('|'), 'i');
        if (!includeRegex.test(entry.url)) {
          return false;
        }
      }

      // Check exclude patterns
      if (options.excludePatterns?.length) {
        const excludeRegex = new RegExp(options.excludePatterns.join('|'), 'i');
        if (excludeRegex.test(entry.url)) {
          return false;
        }
      }

      // Check max age
      if (options.maxAge && entry.lastModified) {
        const maxAgeMs = options.maxAge * 24 * 60 * 60 * 1000;
        if (Date.now() - entry.lastModified.getTime() > maxAgeMs) {
          return false;
        }
      }

      // Check minimum priority
      if (options.minPriority && entry.priority && entry.priority < options.minPriority) {
        return false;
      }

      // Check change frequency
      if (options.changeFrequency?.length && entry.changeFrequency) {
        if (!options.changeFrequency.includes(entry.changeFrequency)) {
          return false;
        }
      }

      return true;
    });
  }

  // Sort entries by priority and last modified date
  sortEntries(entries: SitemapEntry[], sortBy: 'priority' | 'lastModified' | 'url' = 'priority'): SitemapEntry[] {
    return [...entries].sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          // Higher priority first
          const priorityA = a.priority || 0.5;
          const priorityB = b.priority || 0.5;
          return priorityB - priorityA;
          
        case 'lastModified':
          // Newer first
          const dateA = a.lastModified?.getTime() || 0;
          const dateB = b.lastModified?.getTime() || 0;
          return dateB - dateA;
          
        case 'url':
          return a.url.localeCompare(b.url);
          
        default:
          return 0;
      }
    });
  }
}
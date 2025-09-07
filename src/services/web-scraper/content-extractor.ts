import type { WebContentExtractor, ExtractedContent, ContentMetadata } from './types';
import { NODE_CONSTANTS, NODE_FILTER_CONSTANTS, isElement, isTextNode, type LinkedomDocument, type LinkedomElement, type LinkedomNode } from './dom-types';

export class HTMLContentExtractor implements WebContentExtractor {
  private readonly ignoredTags = new Set([
    'script', 'style', 'nav', 'footer', 'header', 'aside', 
    'noscript', 'svg', 'canvas', 'iframe'
  ]);

  private readonly contentSelectors = [
    'main',
    'article', 
    '[role="main"]',
    '.content',
    '.main-content',
    '.post-content',
    '.entry-content',
    '#content',
    '.container',
  ];

  async extractContent(html: string, url: string): Promise<ExtractedContent> {
    try {
      // Use linkedom for HTML parsing in Workers environment
      const { parseHTML } = await import('linkedom');
      const { document } = parseHTML(html);

      const title = this.extractTitle(document);
      const content = this.extractMainContent(document);
      const metadata = this.extractMetadata(document, html);

      return {
        title,
        content: this.cleanText(content),
        metadata,
      };
    } catch (error) {
      console.error('Content extraction error:', error);
      
      // Fallback: basic text extraction
      const title = this.extractTitleFallback(html);
      const content = this.extractContentFallback(html);
      
      return {
        title,
        content: this.cleanText(content),
        metadata: {},
      };
    }
  }

  private extractTitle(document: LinkedomDocument): string {
    // Try different title sources in order of preference
    const titleSources = [
      () => (document.querySelector('meta[property="og:title"]') as any)?.getAttribute('content'),
      () => (document.querySelector('meta[name="twitter:title"]') as any)?.getAttribute('content'),
      () => (document.querySelector('h1') as any)?.textContent?.trim(),
      () => (document.querySelector('title') as any)?.textContent?.trim(),
    ];

    for (const getTitle of titleSources) {
      const title = getTitle();
      if (title && title.length > 0 && title.length < 200) {
        return title;
      }
    }

    return 'Untitled';
  }

  private extractMainContent(document: LinkedomDocument): string {
    // Try to find main content area using common selectors
    for (const selector of this.contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return this.extractTextFromElement(element);
      }
    }

    // Fallback: extract from body, excluding ignored tags
    const body = document.querySelector('body');
    if (body) {
      return this.extractTextFromElement(body);
    }

    return '';
  }

  private extractTextFromElement(element: Element): string {
    const textParts: string[] = [];
    
    // Since we can't reliably use TreeWalker in Workers, we'll use a simpler approach
    // Get all text nodes recursively
    this.extractTextRecursively(element, textParts);
    
    return textParts.join(' ').replace(/\n+/g, '\n').trim();
  }

  private extractTextRecursively(element: any, textParts: string[]): void {
    for (const child of Array.from((element as any).childNodes || [])) {
      if (isTextNode(child)) {
        const text = (child as any).textContent?.trim() || '';
        if (text.length > 0) {
          textParts.push(text);
        }
      } else if (isElement(child)) {
        const tagName = (child as Element).tagName.toLowerCase();
        
        // Skip ignored tags
        if (this.ignoredTags.has(tagName)) {
          continue;
        }
        
        // Add spacing for block elements
        if (['p', 'div', 'section', 'article', 'li', 'br'].includes(tagName)) {
          textParts.push('\n');
        } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          textParts.push('\n\n');
        }
        
        // Recursively process children
        this.extractTextRecursively(child as Element, textParts);
        
        // Add spacing after block elements
        if (['p', 'div', 'section', 'article', 'li'].includes(tagName)) {
          textParts.push('\n');
        } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          textParts.push('\n');
        }
      }
    }
  }

  extractMetadata(document: LinkedomDocument, html: string): ContentMetadata {
    const metadata: ContentMetadata = {};

    // Extract description
    const descriptionSources = [
      () => (document.querySelector('meta[property="og:description"]') as any)?.getAttribute('content'),
      () => (document.querySelector('meta[name="twitter:description"]') as any)?.getAttribute('content'),
      () => (document.querySelector('meta[name="description"]') as any)?.getAttribute('content'),
    ];

    for (const getDescription of descriptionSources) {
      const description = getDescription();
      if (description && description.length > 0) {
        metadata.description = description;
        break;
      }
    }

    // Extract keywords
    const keywordsContent = (document.querySelector('meta[name="keywords"]') as any)?.getAttribute('content');
    if (keywordsContent) {
      metadata.keywords = keywordsContent.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
    }

    // Extract author
    const authorSources = [
      () => (document.querySelector('meta[name="author"]') as any)?.getAttribute('content'),
      () => (document.querySelector('meta[property="article:author"]') as any)?.getAttribute('content'),
      () => (document.querySelector('[rel="author"]') as any)?.textContent?.trim(),
    ];

    for (const getAuthor of authorSources) {
      const author = getAuthor();
      if (author && author.length > 0) {
        metadata.author = author;
        break;
      }
    }

    // Extract published date
    const dateSources = [
      () => document.querySelector('meta[property="article:published_time"]')?.getAttribute('content'),
      () => document.querySelector('meta[name="date"]')?.getAttribute('content'),
      () => document.querySelector('time[datetime]')?.getAttribute('datetime'),
      () => document.querySelector('time')?.textContent?.trim(),
    ];

    for (const getDate of dateSources) {
      const dateStr = getDate();
      if (dateStr) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          metadata.publishedDate = date;
          break;
        }
      }
    }

    // Extract images
    const images = Array.from(document.querySelectorAll('img[src]') || [])
      .map((img: any) => img.getAttribute('src'))
      .filter((src): src is string => !!src)
      .slice(0, 10); // Limit to first 10 images
    
    if (images.length > 0) {
      metadata.images = images;
    }

    // Extract headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6') || [])
      .map((h: any) => h.textContent?.trim())
      .filter((text): text is string => !!text && text.length > 0)
      .slice(0, 20); // Limit to first 20 headings
    
    if (headings.length > 0) {
      metadata.headings = headings;
    }

    // Extract links
    const links = Array.from(document.querySelectorAll('a[href]') || [])
      .map((a: any) => a.getAttribute('href'))
      .filter((href): href is string => !!href)
      .slice(0, 50); // Limit to first 50 links
    
    if (links.length > 0) {
      metadata.links = links;
    }

    return metadata;
  }

  cleanText(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Clean up common artifacts
      .replace(/\u00A0/g, ' ') // Non-breaking space
      .replace(/\u2013|\u2014/g, '-') // En/em dashes
      .replace(/\u2026/g, '...') // Ellipsis
      .replace(/[\u2018\u2019]/g, "'") // Smart quotes
      .replace(/[\u201C\u201D]/g, '"') // Smart quotes
      // Remove URLs and email patterns that might be artifacts
      .replace(/https?:\/\/[^\s]+/g, ' ')
      .replace(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/g, ' ')
      // Clean up spacing around punctuation
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/([.,!?;:])\s+/g, '$1 ')
      // Remove multiple spaces
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Fallback methods for when DOM parsing fails
  private extractTitleFallback(html: string): string {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }

    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      return h1Match[1].trim();
    }

    return 'Untitled';
  }

  private extractContentFallback(html: string): string {
    // Remove script and style content
    let text = html
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<[^>]*>/g, ' ') // Remove all HTML tags
      .replace(/&[^;]+;/g, ' ') // Remove HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return text;
  }
}
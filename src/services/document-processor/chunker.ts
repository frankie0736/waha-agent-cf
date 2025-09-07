import type { DocumentChunk, ChunkingOptions } from './types';

export class DocumentChunker {
  private readonly defaultOptions: ChunkingOptions = {
    maxChunkSize: 1000,
    overlapSize: 200,
    preserveParagraphs: true,
    minChunkSize: 50,
  };

  constructor(private options: Partial<ChunkingOptions> = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Split document content into chunks with overlap
   */
  chunkDocument(
    content: string,
    docId: string,
    kbId: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const cleanContent = this.cleanContent(content);
    
    if (cleanContent.length < this.options.minChunkSize!) {
      // Document too short, create single chunk
      chunks.push(this.createChunk(cleanContent, 0, docId, kbId));
      return chunks;
    }

    const paragraphs = this.options.preserveParagraphs 
      ? this.splitIntoParagraphs(cleanContent)
      : [cleanContent];

    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      // If adding this paragraph would exceed max size, create a chunk
      if (currentChunk.length + paragraph.length > this.options.maxChunkSize!) {
        if (currentChunk.length > 0) {
          chunks.push(this.createChunk(currentChunk.trim(), chunkIndex, docId, kbId));
          chunkIndex++;
          
          // Start new chunk with overlap from previous chunk
          currentChunk = this.createOverlap(currentChunk) + paragraph;
        } else {
          // Paragraph itself is too long, split it
          const subChunks = this.splitLongParagraph(paragraph, docId, kbId, chunkIndex);
          chunks.push(...subChunks);
          chunkIndex += subChunks.length;
          currentChunk = '';
        }
      } else {
        currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + paragraph;
      }
    }

    // Add remaining content as final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(this.createChunk(currentChunk.trim(), chunkIndex, docId, kbId));
    }

    return chunks;
  }

  /**
   * Create overlap text from the end of current chunk
   */
  private createOverlap(text: string): string {
    if (text.length <= this.options.overlapSize!) {
      return text + '\n\n';
    }

    // Try to find a good breaking point (sentence or word boundary)
    const overlapText = text.slice(-this.options.overlapSize!);
    const lastSentenceIndex = overlapText.lastIndexOf('. ');
    const lastWordIndex = overlapText.lastIndexOf(' ');

    if (lastSentenceIndex > overlapText.length * 0.3) {
      return overlapText.slice(lastSentenceIndex + 2) + '\n\n';
    } else if (lastWordIndex > overlapText.length * 0.5) {
      return overlapText.slice(lastWordIndex + 1) + '\n\n';
    } else {
      return overlapText + '\n\n';
    }
  }

  /**
   * Split a paragraph that's too long into multiple chunks
   */
  private splitLongParagraph(
    paragraph: string, 
    docId: string, 
    kbId: string, 
    startIndex: number
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const sentences = this.splitIntoSentences(paragraph);
    
    let currentChunk = '';
    let chunkIndex = startIndex;

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > this.options.maxChunkSize!) {
        if (currentChunk.length > 0) {
          chunks.push(this.createChunk(currentChunk.trim(), chunkIndex, docId, kbId));
          chunkIndex++;
          currentChunk = this.createOverlap(currentChunk) + sentence;
        } else {
          // Even a single sentence is too long, force split
          const forcedChunks = this.forceSplit(sentence, docId, kbId, chunkIndex);
          chunks.push(...forcedChunks);
          chunkIndex += forcedChunks.length;
        }
      } else {
        currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(this.createChunk(currentChunk.trim(), chunkIndex, docId, kbId));
    }

    return chunks;
  }

  /**
   * Force split text that's too long even for a single chunk
   */
  private forceSplit(
    text: string, 
    docId: string, 
    kbId: string, 
    startIndex: number
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const maxSize = this.options.maxChunkSize! - this.options.overlapSize!;
    
    let remaining = text;
    let chunkIndex = startIndex;

    while (remaining.length > maxSize) {
      // Find the best break point within maxSize
      const chunk = remaining.slice(0, maxSize);
      const lastSpaceIndex = chunk.lastIndexOf(' ');
      
      const breakPoint = lastSpaceIndex > maxSize * 0.7 ? lastSpaceIndex : maxSize;
      const chunkText = remaining.slice(0, breakPoint);
      
      chunks.push(this.createChunk(chunkText, chunkIndex, docId, kbId));
      remaining = chunkText.slice(-this.options.overlapSize!) + remaining.slice(breakPoint);
      chunkIndex++;
    }

    if (remaining.trim().length > 0) {
      chunks.push(this.createChunk(remaining.trim(), chunkIndex, docId, kbId));
    }

    return chunks;
  }

  /**
   * Clean and normalize content
   */
  private cleanContent(content: string): string {
    return content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\t/g, '  ')
      .replace(/[^\S\n]{2,}/g, ' ')
      .trim();
  }

  /**
   * Split content into paragraphs
   */
  private splitIntoParagraphs(content: string): string[] {
    return content
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    return text
      .split(/[.!?]+\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Create a chunk object
   */
  private createChunk(
    text: string, 
    chunkIndex: number, 
    docId: string, 
    kbId: string
  ): DocumentChunk {
    return {
      id: crypto.randomUUID(),
      kbId,
      docId,
      chunkIndex,
      text: text.trim(),
      createdAt: new Date(),
    };
  }

  /**
   * Validate chunk quality
   */
  validateChunk(chunk: DocumentChunk): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (chunk.text.length < this.options.minChunkSize!) {
      issues.push(`Chunk too short (${chunk.text.length} chars, min ${this.options.minChunkSize})`);
    }
    
    if (chunk.text.length > this.options.maxChunkSize! * 1.1) {
      issues.push(`Chunk too long (${chunk.text.length} chars, max ${this.options.maxChunkSize})`);
    }
    
    if (chunk.text.trim().length === 0) {
      issues.push('Chunk is empty or only whitespace');
    }
    
    // Check for excessive special characters (potential encoding issues)
    const specialCharRatio = (chunk.text.match(/[^\w\s.,!?;:()\-'"]/g) || []).length / chunk.text.length;
    if (specialCharRatio > 0.3) {
      issues.push(`High special character ratio (${(specialCharRatio * 100).toFixed(1)}%)`);
    }
    
    return {
      isValid: issues.length === 0,
      issues,
    };
  }
}
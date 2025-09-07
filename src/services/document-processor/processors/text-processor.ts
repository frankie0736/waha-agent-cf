import type { DocumentProcessor } from '../types';

export class TextProcessor implements DocumentProcessor {
  readonly supportedMimeTypes = [
    'text/plain',
    'text/markdown'
  ];

  async process(fileBuffer: ArrayBuffer, filename: string, mimeType: string): Promise<string> {
    try {
      const startTime = Date.now();
      
      // Convert ArrayBuffer to text
      const decoder = new TextDecoder('utf-8');
      let rawText = decoder.decode(fileBuffer);
      
      // If UTF-8 decoding produces garbage, try other encodings
      if (this.containsGarbageCharacters(rawText)) {
        // Try Latin-1 encoding
        const latin1Decoder = new TextDecoder('latin1');
        const latin1Text = latin1Decoder.decode(fileBuffer);
        
        if (!this.containsGarbageCharacters(latin1Text)) {
          rawText = latin1Text;
        } else {
          // Try Windows-1252 if available
          try {
            const win1252Decoder = new TextDecoder('windows-1252');
            rawText = win1252Decoder.decode(fileBuffer);
          } catch {
            // Fall back to UTF-8 even if it has issues
            rawText = decoder.decode(fileBuffer);
          }
        }
      }

      const processingTime = Date.now() - startTime;

      let processedText: string;
      
      if (mimeType === 'text/markdown') {
        processedText = this.processMarkdown(rawText);
      } else {
        processedText = this.processPlainText(rawText);
      }

      if (!processedText || processedText.trim().length === 0) {
        throw new Error('No readable text content found in file');
      }

      console.log(`Text processed: ${filename}, type: ${mimeType}, time: ${processingTime}ms`);
      
      return processedText;
    } catch (error) {
      console.error('Text processing error:', error);
      throw new Error(`Failed to process text file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process plain text files
   */
  private processPlainText(text: string): string {
    return this.cleanText(text);
  }

  /**
   * Process Markdown files
   */
  private processMarkdown(text: string): string {
    // Convert Markdown to plain text while preserving structure
    return text
      // Convert headers to text with context
      .replace(/^#{1,6}\s+(.+)$/gm, (match, title) => {
        const level = match.indexOf(' ') - 1;
        const prefix = level === 1 ? 'TITLE: ' : 
                      level === 2 ? 'SECTION: ' : 
                      level === 3 ? 'SUBSECTION: ' : 'HEADING: ';
        return prefix + title;
      })
      // Convert emphasis
      .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
      .replace(/\*(.*?)\*/g, '$1') // Italic
      .replace(/__(.*?)__/g, '$1') // Bold
      .replace(/_(.*?)_/g, '$1') // Italic
      // Convert code blocks
      .replace(/```[\s\S]*?```/g, match => {
        const code = match.replace(/```(\w+)?\n?/g, '').replace(/```$/g, '');
        return `CODE BLOCK:\n${code}\n`;
      })
      // Convert inline code
      .replace(/`([^`]+)`/g, 'CODE: $1')
      // Convert links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 (Link: $2)')
      // Convert images
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, 'IMAGE: $1 (Source: $2)')
      // Convert lists
      .replace(/^[\s]*[-*+]\s+(.+)$/gm, '• $1')
      .replace(/^[\s]*\d+\.\s+(.+)$/gm, (match, item, offset, string) => {
        const linesBefore = string.substring(0, offset).split('\n');
        const currentLineIndex = linesBefore.length - 1;
        let itemNumber = 1;
        
        // Count previous numbered items
        for (let i = currentLineIndex - 1; i >= 0; i--) {
          if (linesBefore[i].match(/^\s*\d+\.\s+/)) {
            itemNumber++;
          } else if (linesBefore[i].trim().length === 0) {
            continue;
          } else {
            break;
          }
        }
        
        return `${itemNumber}. ${item}`;
      })
      // Convert blockquotes
      .replace(/^>\s+(.+)$/gm, 'QUOTE: $1')
      // Convert horizontal rules
      .replace(/^[-*_]{3,}$/gm, '---')
      // Convert tables to readable format
      .replace(/\|(.+)\|/g, (match, content) => {
        return content.split('|').map((cell: string) => cell.trim()).join(' | ');
      })
      // Remove table separators
      .replace(/^\|?[-\s|:]+\|?$/gm, '')
      // Clean up the result
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    return text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove BOM if present
      .replace(/^\uFEFF/, '')
      // Remove excessive whitespace
      .replace(/[ \t]+/g, ' ')
      // Remove excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing whitespace from lines
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n')
      // Trim overall
      .trim();
  }

  /**
   * Check if text contains garbage characters (encoding issues)
   */
  private containsGarbageCharacters(text: string): boolean {
    // Check for common encoding artifacts
    const garbagePatterns = [
      /\uFFFD/g, // Replacement character
      /[^\x00-\x7F]{3,}/g, // Long sequences of non-ASCII
      /[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, // Control characters (except \t, \n, \r)
    ];
    
    // Check if more than 5% of characters are problematic
    let garbageCount = 0;
    
    for (const pattern of garbagePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        garbageCount += matches.join('').length;
      }
    }
    
    return garbageCount > text.length * 0.05;
  }

  /**
   * Validate text file before processing
   */
  validateTextFile(buffer: ArrayBuffer, mimeType: string): { isValid: boolean; error?: string } {
    try {
      // Check minimum size
      if (buffer.byteLength === 0) {
        return { isValid: false, error: 'File is empty' };
      }

      // Check maximum size (already handled by upload, but double-check)
      if (buffer.byteLength > 50 * 1024 * 1024) {
        return { isValid: false, error: 'File too large' };
      }

      // Try to decode as text
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        decoder.decode(buffer.slice(0, Math.min(1024, buffer.byteLength)));
      } catch {
        // If UTF-8 fails, try to decode with fallback
        try {
          const decoder = new TextDecoder('latin1');
          const sample = decoder.decode(buffer.slice(0, Math.min(1024, buffer.byteLength)));
          
          // Check if it looks like binary data
          const binaryRatio = (sample.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g) || []).length / sample.length;
          if (binaryRatio > 0.3) {
            return { isValid: false, error: 'File appears to be binary, not text' };
          }
        } catch {
          return { isValid: false, error: 'File is not valid text' };
        }
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `Text file validation error: ${error}` };
    }
  }

  /**
   * Extract metadata from text file
   */
  async extractMetadata(fileBuffer: ArrayBuffer, mimeType: string): Promise<{
    lineCount?: number;
    wordCount?: number;
    characterCount?: number;
    encoding?: string;
    hasMarkdown?: boolean;
  }> {
    try {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(fileBuffer);
      
      const lines = text.split('\n');
      const words = text.split(/\s+/).filter(word => word.length > 0);
      
      // Detect if it's Markdown even if MIME type is text/plain
      const hasMarkdownSyntax = /#{1,6}\s|^\*\s|\*\*.*?\*\*|__.*?__|`.*?`|\[.*?\]\(.*?\)/m.test(text);
      
      return {
        lineCount: lines.length,
        wordCount: words.length,
        characterCount: text.length,
        encoding: 'utf-8',
        hasMarkdown: mimeType === 'text/markdown' || hasMarkdownSyntax,
      };
    } catch (error) {
      console.error('Text metadata extraction error:', error);
      return {};
    }
  }

  /**
   * Detect the likely file type based on content
   */
  detectContentType(text: string): 'markdown' | 'code' | 'data' | 'plain' {
    // Check for Markdown patterns
    if (/#{1,6}\s|^\*\s|\*\*.*?\*\*|__.*?__|`.*?`|\[.*?\]\(.*?\)|^>\s/m.test(text)) {
      return 'markdown';
    }
    
    // Check for code patterns
    if (/(?:function|class|import|export|def|public|private|var|let|const)\s|\{[\s\S]*\}|<\w+[^>]*>/m.test(text)) {
      return 'code';
    }
    
    // Check for structured data
    if (/^[\w\s,]+(?:,[\w\s,]+)*$/m.test(text) || /^\d+[\t,|]\d+/m.test(text)) {
      return 'data';
    }
    
    return 'plain';
  }
}
import type { DocumentProcessor, ProcessingResult } from '../types';

export class WordProcessor implements DocumentProcessor {
  readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword' // .doc
  ];

  async process(fileBuffer: ArrayBuffer, filename: string, mimeType: string): Promise<string> {
    try {
      const startTime = Date.now();

      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        return await this.processDocx(fileBuffer, filename);
      } else if (mimeType === 'application/msword') {
        // For legacy .doc files, we'll provide limited support
        return await this.processDoc(fileBuffer, filename);
      } else {
        throw new Error(`Unsupported Word document type: ${mimeType}`);
      }
    } catch (error) {
      console.error('Word document processing error:', error);
      throw new Error(`Failed to process Word document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process .docx files using mammoth
   */
  private async processDocx(fileBuffer: ArrayBuffer, filename: string): Promise<string> {
    try {
      // Import mammoth dynamically
      const mammoth = await import('mammoth');
      
      const startTime = Date.now();
      
      // Convert ArrayBuffer to Buffer for mammoth
      const buffer = Buffer.from(fileBuffer);
      
      // Extract text with mammoth
      const result = await mammoth.extractRawText({ buffer });
      
      const processingTime = Date.now() - startTime;
      
      if (result.messages.length > 0) {
        console.log('Mammoth processing messages:', result.messages);
      }

      const cleanedText = this.cleanWordText(result.value);
      
      if (!cleanedText || cleanedText.trim().length === 0) {
        throw new Error('No text content found in Word document');
      }

      console.log(`DOCX processed: ${filename}, time: ${processingTime}ms`);
      
      return cleanedText;
    } catch (error) {
      console.error('DOCX processing error:', error);
      throw error;
    }
  }

  /**
   * Process legacy .doc files (limited support)
   */
  private async processDoc(fileBuffer: ArrayBuffer, filename: string): Promise<string> {
    try {
      // For .doc files, we'll try to extract basic text
      // This is limited because .doc format is complex binary format
      
      const buffer = Buffer.from(fileBuffer);
      
      // Simple text extraction from .doc files (very basic)
      let text = '';
      
      // Look for readable text in the buffer
      for (let i = 0; i < buffer.length - 1; i++) {
        const char = buffer[i];
        // Extract printable ASCII characters and common Unicode
        if (char !== undefined && ((char >= 32 && char <= 126) || char === 10 || char === 13)) {
          text += String.fromCharCode(char);
        } else if (char !== undefined && char === 0) {
          text += ' '; // Replace null bytes with spaces
        }
      }

      // Clean up the extracted text
      const cleanedText = text
        .replace(/\0+/g, ' ') // Remove null bytes
        .replace(/[^\x20-\x7E\n\r]/g, '') // Remove non-printable characters
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      if (!cleanedText || cleanedText.length < 10) {
        throw new Error('Unable to extract meaningful text from legacy .doc file. Please convert to .docx format for better results.');
      }

      console.log(`DOC processed (basic): ${filename}`);
      
      return this.cleanWordText(cleanedText);
    } catch (error) {
      console.error('DOC processing error:', error);
      throw new Error('Legacy .doc files have limited support. Please convert to .docx format for better extraction.');
    }
  }

  /**
   * Clean and normalize extracted Word document text
   */
  private cleanWordText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove page breaks and section breaks
      .replace(/\f/g, '\n\n') // Form feed character
      // Remove excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Clean up bullet points
      .replace(/^[•·▪▫‣⁃]\s*/gm, '• ')
      // Normalize quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Remove extra spaces around punctuation
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/([.,!?;:])\s+/g, '$1 ')
      // Remove common Word artifacts
      .replace(/\u00A0/g, ' ') // Non-breaking space
      .replace(/\u2013|\u2014/g, '-') // En/em dashes
      .replace(/\u2026/g, '...') // Ellipsis
      // Trim
      .trim();
  }

  /**
   * Validate Word document before processing
   */
  validateWordDoc(buffer: ArrayBuffer, mimeType: string): { isValid: boolean; error?: string } {
    try {
      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        return this.validateDocx(buffer);
      } else if (mimeType === 'application/msword') {
        return this.validateDoc(buffer);
      } else {
        return { isValid: false, error: 'Unsupported Word document type' };
      }
    } catch (error) {
      return { isValid: false, error: `Word document validation error: ${error}` };
    }
  }

  /**
   * Validate .docx file
   */
  private validateDocx(buffer: ArrayBuffer): { isValid: boolean; error?: string } {
    try {
      // DOCX files are ZIP archives, check for ZIP header
      const header = new Uint8Array(buffer.slice(0, 4));
      
      // ZIP file magic number: 50 4B 03 04 or 50 4B 05 06
      if (!(header[0] === 0x50 && header[1] === 0x4B && 
           (header[2] === 0x03 || header[2] === 0x05))) {
        return { isValid: false, error: 'Invalid DOCX format (not a ZIP archive)' };
      }

      // Check minimum size
      if (buffer.byteLength < 1024) {
        return { isValid: false, error: 'DOCX file too small' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `DOCX validation error: ${error}` };
    }
  }

  /**
   * Validate .doc file
   */
  private validateDoc(buffer: ArrayBuffer): { isValid: boolean; error?: string } {
    try {
      // DOC files have specific OLE header
      const header = new Uint8Array(buffer.slice(0, 8));
      
      // Check for OLE signature: D0CF11E0A1B11AE1
      const oleSignature = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
      
      for (let i = 0; i < 8; i++) {
        if (header[i] !== oleSignature[i]) {
          return { isValid: false, error: 'Invalid DOC format (not an OLE document)' };
        }
      }

      // Check minimum size
      if (buffer.byteLength < 2048) {
        return { isValid: false, error: 'DOC file too small' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `DOC validation error: ${error}` };
    }
  }

  /**
   * Extract basic metadata from Word document
   */
  async extractMetadata(fileBuffer: ArrayBuffer, mimeType: string): Promise<{
    wordCount?: number;
    paragraphCount?: number;
    hasImages?: boolean;
    hasHeaders?: boolean;
  }> {
    try {
      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // For DOCX, we can get more detailed metadata through mammoth
        const mammoth = await import('mammoth');
        const buffer = Buffer.from(fileBuffer);
        
        const result = await mammoth.extractRawText({ buffer });
        const text = result.value;
        
        return {
          wordCount: text.split(/\s+/).filter(word => word.length > 0).length,
          paragraphCount: text.split(/\n\s*\n/).length,
          hasImages: result.messages.some(msg => msg.type === 'warning' && msg.message.includes('image')),
        };
      } else {
        // Limited metadata for .doc files - return empty object to avoid exactOptionalPropertyTypes issues
        return {};
      }
    } catch (error) {
      console.error('Word metadata extraction error:', error);
      return {};
    }
  }
}
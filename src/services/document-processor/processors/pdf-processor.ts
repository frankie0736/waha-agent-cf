import type { DocumentProcessor, ProcessingResult } from '../types';

export class PDFProcessor implements DocumentProcessor {
  readonly supportedMimeTypes = ['application/pdf'];

  async process(fileBuffer: ArrayBuffer, filename: string, mimeType: string): Promise<string> {
    try {
      // Import pdf-parse dynamically to handle Cloudflare Workers compatibility
      const pdfParse = await import('pdf-parse');
      
      const startTime = Date.now();
      
      // Convert ArrayBuffer to Buffer for pdf-parse
      const buffer = Buffer.from(fileBuffer);
      
      // Parse PDF
      const data = await pdfParse.default(buffer, {
        // Disable image rendering for faster processing
        pageRenderCountLimit: 0,
        // Maximum pages to process (prevent memory issues)
        max: 100,
      });

      const processingTime = Date.now() - startTime;

      // Clean and normalize the extracted text
      const cleanedText = this.cleanPdfText(data.text);
      
      if (!cleanedText || cleanedText.trim().length === 0) {
        throw new Error('No text content found in PDF');
      }

      console.log(`PDF processed: ${filename}, pages: ${data.numpages}, time: ${processingTime}ms`);
      
      return cleanedText;
    } catch (error) {
      console.error('PDF processing error:', error);
      throw new Error(`Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean and normalize extracted PDF text
   */
  private cleanPdfText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Fix common PDF extraction issues
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between words that got merged
      // Remove page numbers and headers/footers (basic heuristic)
      .replace(/^\d+\s*$/gm, '') // Remove lines that are just page numbers
      // Remove excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Remove bullet point artifacts
      .replace(/^[•·▪▫‣⁃]\s*/gm, '• ')
      // Normalize quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Remove extra spaces around punctuation
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/([.,!?;:])\s+/g, '$1 ')
      // Trim
      .trim();
  }

  /**
   * Validate PDF file before processing
   */
  validatePdf(buffer: ArrayBuffer): { isValid: boolean; error?: string } {
    try {
      // Check PDF header
      const header = new Uint8Array(buffer.slice(0, 5));
      const pdfHeader = String.fromCharCode(...header);
      
      if (!pdfHeader.startsWith('%PDF-')) {
        return { isValid: false, error: 'Invalid PDF header' };
      }

      // Check minimum size (empty PDFs are usually around 1KB)
      if (buffer.byteLength < 1024) {
        return { isValid: false, error: 'PDF file too small' };
      }

      // Check maximum size (50MB limit from upload)
      if (buffer.byteLength > 50 * 1024 * 1024) {
        return { isValid: false, error: 'PDF file too large' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `PDF validation error: ${error}` };
    }
  }

  /**
   * Extract metadata from PDF
   */
  async extractMetadata(fileBuffer: ArrayBuffer): Promise<{
    pageCount?: number;
    title?: string;
    author?: string;
    creator?: string;
    creationDate?: Date;
  }> {
    try {
      const pdfParse = await import('pdf-parse');
      const buffer = Buffer.from(fileBuffer);
      
      const data = await pdfParse.default(buffer, {
        pageRenderCountLimit: 0,
        max: 1, // Only process first page to get metadata
      });

      const metadata: {
        pageCount?: number;
        title?: string;
        author?: string;
        creator?: string;
        creationDate?: Date;
      } = {
        pageCount: data.numpages,
      };

      // Only add properties if they have values to avoid exactOptionalPropertyTypes issues
      if (data.info?.Title) {
        metadata.title = data.info.Title;
      }
      if (data.info?.Author) {
        metadata.author = data.info.Author;
      }
      if (data.info?.Creator) {
        metadata.creator = data.info.Creator;
      }
      if (data.info?.CreationDate) {
        metadata.creationDate = data.info.CreationDate;
      }

      return metadata;
    } catch (error) {
      console.error('PDF metadata extraction error:', error);
      return {};
    }
  }
}
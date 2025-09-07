import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../../../database/schema';

import { DocumentChunker } from './chunker';
import { PDFProcessor } from './processors/pdf-processor';
import { WordProcessor } from './processors/word-processor';
import { ExcelProcessor } from './processors/excel-processor';
import { PowerPointProcessor } from './processors/powerpoint-processor';
import { TextProcessor } from './processors/text-processor';
import { VectorEmbeddingManager } from '../vector-embedding';

import type { 
  DocumentProcessor, 
  SupportedMimeType, 
  ProcessedDocument, 
  DocumentChunk 
} from './types';
import type { Env } from '../../types';

export class DocumentProcessorService {
  private processors: Map<string, DocumentProcessor> = new Map();
  private chunker: DocumentChunker;
  private vectorManager: VectorEmbeddingManager | undefined;

  constructor() {
    this.initializeProcessors();
    this.chunker = new DocumentChunker({
      maxChunkSize: 1000,
      overlapSize: 200,
      preserveParagraphs: true,
      minChunkSize: 50,
    });
  }

  /**
   * Initialize vector embedding manager
   */
  setVectorManager(env: Env): void {
    try {
      this.vectorManager = new VectorEmbeddingManager(env);
    } catch (error) {
      console.warn('Vector embedding manager not available:', error);
      // this.vectorManager remains undefined
    }
  }

  /**
   * Initialize all document processors
   */
  private initializeProcessors(): void {
    const processors = [
      new PDFProcessor(),
      new WordProcessor(),
      new ExcelProcessor(),
      new PowerPointProcessor(),
      new TextProcessor(),
    ];

    processors.forEach(processor => {
      processor.supportedMimeTypes.forEach(mimeType => {
        this.processors.set(mimeType, processor);
      });
    });
  }

  /**
   * Process a document and save chunks to database
   */
  async processDocument(
    docId: string,
    kbId: string,
    fileBuffer: ArrayBuffer,
    filename: string,
    mimeType: SupportedMimeType,
    db: any // Drizzle database instance
  ): Promise<{
    success: boolean;
    content?: string;
    chunks?: DocumentChunk[];
    error?: string;
    metadata?: any;
  }> {
    const startTime = Date.now();

    try {
      console.log(`Starting document processing: ${filename} (${mimeType})`);

      // Get the appropriate processor
      const processor = this.processors.get(mimeType);
      if (!processor) {
        throw new Error(`No processor found for MIME type: ${mimeType}`);
      }

      // Update document status to processing
      await this.updateDocumentStatus(db, docId, 'processing');

      // Process the document to extract text content
      const content = await processor.process(fileBuffer, filename, mimeType);

      if (!content || content.trim().length === 0) {
        throw new Error('No text content extracted from document');
      }

      // Create chunks from the extracted content
      const chunks = this.chunker.chunkDocument(content, docId, kbId);

      if (chunks.length === 0) {
        throw new Error('No chunks generated from document content');
      }

      console.log(`Generated ${chunks.length} chunks for document: ${filename}`);

      // Validate chunks
      const validChunks: DocumentChunk[] = [];
      const invalidChunks: string[] = [];

      for (const chunk of chunks) {
        const validation = this.chunker.validateChunk(chunk);
        if (validation.isValid) {
          validChunks.push(chunk);
        } else {
          invalidChunks.push(`Chunk ${chunk.chunkIndex}: ${validation.issues.join(', ')}`);
          console.warn(`Invalid chunk in ${filename}:`, validation.issues);
        }
      }

      if (validChunks.length === 0) {
        throw new Error('No valid chunks generated from document');
      }

      if (invalidChunks.length > 0) {
        console.warn(`${invalidChunks.length} invalid chunks in ${filename}:`, invalidChunks);
      }

      // Save chunks to database
      await this.saveChunksToDatabase(db, validChunks);

      // Trigger vectorization if available
      if (this.vectorManager) {
        try {
          console.log(`Starting vectorization for ${validChunks.length} chunks`);
          
          try {
            // Try to queue chunks for async processing
            await this.vectorManager.queueChunksForEmbedding(
              validChunks.map(chunk => ({
                id: chunk.id,
                kbId: chunk.kbId,
                docId: chunk.docId,
                chunkIndex: chunk.chunkIndex,
                text: chunk.text
              }))
            );

            console.log(`Successfully queued ${validChunks.length} chunks for vectorization`);
          } catch (queueError) {
            // If queuing fails, process synchronously
            console.log('Queue not available, processing vectors synchronously');
            
            const vectorResult = await this.vectorManager.processChunksForVectorization(
              validChunks.map(chunk => ({
                id: chunk.id,
                kbId: chunk.kbId,
                docId: chunk.docId,
                chunkIndex: chunk.chunkIndex,
                text: chunk.text,
                createdAt: chunk.createdAt
              }))
            );

            if (vectorResult.success) {
              console.log(`Successfully vectorized ${vectorResult.processedCount} chunks`);
            } else {
              console.warn(`Vectorization partially failed: ${vectorResult.failedCount} failed, errors:`, vectorResult.errors);
            }
          }
        } catch (vectorError) {
          console.warn('Failed to queue chunks for vectorization:', vectorError);
          // Don't fail the document processing if vectorization fails
        }
      } else {
        console.log('Vector embedding manager not available, skipping vectorization');
      }

      // Update document status to completed
      await this.updateDocumentStatus(db, docId, 'completed');

      const processingTime = Date.now() - startTime;

      console.log(`Document processing completed: ${filename}, time: ${processingTime}ms, chunks: ${validChunks.length}`);

      return {
        success: true,
        content,
        chunks: validChunks,
        metadata: {
          processingTime,
          totalChunks: validChunks.length,
          invalidChunks: invalidChunks.length,
          wordCount: content.split(/\s+/).length,
          characterCount: content.length,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      console.error(`Document processing failed for ${filename}:`, error);

      // Update document status to failed with error message
      await this.updateDocumentStatus(db, docId, 'failed', errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Update document processing status in database
   */
  private async updateDocumentStatus(
    db: any,
    docId: string,
    status: 'processing' | 'completed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (errorMessage) {
        updateData.errorMessage = errorMessage;
      }

      await db.update(schema.kbDocuments)
        .set(updateData)
        .where(eq(schema.kbDocuments.id, docId));

    } catch (error) {
      console.error('Failed to update document status:', error);
      // Don't throw here to avoid masking the original error
    }
  }

  /**
   * Save document chunks to database
   */
  private async saveChunksToDatabase(db: any, chunks: DocumentChunk[]): Promise<void> {
    try {
      // Delete existing chunks for this document (in case of reprocessing)
      if (chunks.length > 0 && chunks[0]) {
        await db.delete(schema.kbChunks)
          .where(eq(schema.kbChunks.docId, chunks[0].docId));
      }

      // Insert new chunks in batches
      const batchSize = 50;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        await db.insert(schema.kbChunks).values(
          batch.map(chunk => ({
            id: chunk.id,
            kbId: chunk.kbId,
            docId: chunk.docId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            vectorId: chunk.vectorId || null,
            createdAt: chunk.createdAt,
          }))
        );
      }

      console.log(`Saved ${chunks.length} chunks to database`);
    } catch (error) {
      console.error('Failed to save chunks to database:', error);
      throw new Error(`Database error: ${error}`);
    }
  }

  /**
   * Check if a MIME type is supported
   */
  isSupported(mimeType: string): boolean {
    return this.processors.has(mimeType);
  }

  /**
   * Get all supported MIME types
   */
  getSupportedMimeTypes(): string[] {
    return Array.from(this.processors.keys());
  }

  /**
   * Get processor for a specific MIME type
   */
  getProcessor(mimeType: string): DocumentProcessor | undefined {
    return this.processors.get(mimeType);
  }

  /**
   * Validate document before processing
   */
  async validateDocument(
    fileBuffer: ArrayBuffer,
    mimeType: string,
    filename: string
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      const processor = this.processors.get(mimeType);
      if (!processor) {
        return { isValid: false, error: `Unsupported file type: ${mimeType}` };
      }

      // Basic size check
      if (fileBuffer.byteLength === 0) {
        return { isValid: false, error: 'File is empty' };
      }

      if (fileBuffer.byteLength > 50 * 1024 * 1024) {
        return { isValid: false, error: 'File too large (max 50MB)' };
      }

      // Processor-specific validation
      if (processor instanceof PDFProcessor) {
        return processor.validatePdf(fileBuffer);
      } else if (processor instanceof WordProcessor) {
        return processor.validateWordDoc(fileBuffer, mimeType);
      } else if (processor instanceof ExcelProcessor) {
        return processor.validateExcelFile(fileBuffer, mimeType);
      } else if (processor instanceof PowerPointProcessor) {
        return processor.validatePowerPointFile(fileBuffer, mimeType);
      } else if (processor instanceof TextProcessor) {
        return processor.validateTextFile(fileBuffer, mimeType);
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `Validation error: ${error}` };
    }
  }

  /**
   * Extract metadata from document
   */
  async extractMetadata(
    fileBuffer: ArrayBuffer,
    mimeType: string,
    filename: string
  ): Promise<any> {
    try {
      const processor = this.processors.get(mimeType);
      if (!processor) {
        return {};
      }

      let metadata: any = {};

      if (processor instanceof PDFProcessor) {
        metadata = await processor.extractMetadata(fileBuffer);
      } else if (processor instanceof WordProcessor) {
        metadata = await processor.extractMetadata(fileBuffer, mimeType);
      } else if (processor instanceof ExcelProcessor) {
        metadata = await processor.extractMetadata(fileBuffer);
      } else if (processor instanceof PowerPointProcessor) {
        metadata = await processor.extractMetadata(fileBuffer, mimeType);
      } else if (processor instanceof TextProcessor) {
        metadata = await processor.extractMetadata(fileBuffer, mimeType);
      }

      return {
        ...metadata,
        filename,
        mimeType,
        size: fileBuffer.byteLength,
        extractedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Metadata extraction error:', error);
      return {
        filename,
        mimeType,
        size: fileBuffer.byteLength,
        extractedAt: new Date().toISOString(),
        error: 'Failed to extract metadata',
      };
    }
  }
}

// Export singleton instance
export const documentProcessor = new DocumentProcessorService();

// Export types
export type { DocumentProcessor, SupportedMimeType, ProcessedDocument, DocumentChunk } from './types';
export { DocumentChunker } from './chunker';
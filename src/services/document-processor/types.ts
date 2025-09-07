export interface DocumentChunk {
  id: string;
  kbId: string;
  docId: string;
  chunkIndex: number;
  text: string;
  vectorId?: string;
  createdAt: Date;
}

export interface ProcessedDocument {
  id: string;
  filename: string;
  content: string;
  chunks: DocumentChunk[];
  metadata: {
    pageCount?: number;
    wordCount?: number;
    language?: string;
    extractedAt: Date;
  };
}

export interface ChunkingOptions {
  maxChunkSize: number;
  overlapSize: number;
  preserveParagraphs: boolean;
  minChunkSize: number;
}

export interface DocumentProcessor {
  supportedMimeTypes: string[];
  process(fileBuffer: ArrayBuffer, filename: string, mimeType: string): Promise<string>;
}

export interface ProcessingResult {
  success: boolean;
  content?: string;
  error?: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
    processingTime: number;
  };
}

export type SupportedMimeType = 
  | 'text/plain'
  | 'text/markdown'
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/msword'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.ms-excel'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  | 'application/vnd.ms-powerpoint';
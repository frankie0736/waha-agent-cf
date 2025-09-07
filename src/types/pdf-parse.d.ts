declare module 'pdf-parse' {
  interface PDFInfo {
    Title?: string;
    Author?: string;
    Creator?: string;
    Producer?: string;
    Subject?: string;
    Keywords?: string;
    CreationDate?: Date;
    ModDate?: Date;
    PDFFormatVersion?: string;
  }

  interface PDFData {
    numpages: number;
    numrender: number;
    info: PDFInfo;
    metadata?: any;
    text: string;
  }

  interface PDFParseOptions {
    pageRenderCountLimit?: number;
    max?: number;
    version?: string;
  }

  function PDFParse(
    buffer: Buffer,
    options?: PDFParseOptions
  ): Promise<PDFData>;

  export = PDFParse;
}
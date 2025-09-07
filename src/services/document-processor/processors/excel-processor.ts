import type { DocumentProcessor } from '../types';

export class ExcelProcessor implements DocumentProcessor {
  readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel' // .xls
  ];

  async process(fileBuffer: ArrayBuffer, filename: string, mimeType: string): Promise<string> {
    try {
      // Import xlsx dynamically
      const XLSX = await import('xlsx');
      
      const startTime = Date.now();
      
      // Read the workbook from ArrayBuffer
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      
      const extractedData: string[] = [];
      
      // Process each worksheet
      workbook.SheetNames.forEach((sheetName, index) => {
        const worksheet = workbook.Sheets[sheetName];
        
        if (!worksheet) {
          return; // Skip if worksheet is undefined
        }
        
        // Convert sheet to JSON for structured processing
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1, // Use array of arrays format
          defval: '', // Default value for empty cells
          blankrows: false // Skip blank rows
        }) as unknown[][];

        if (jsonData.length === 0) {
          return; // Skip empty sheets
        }

        // Add sheet header
        extractedData.push(`Sheet: ${sheetName}`);
        extractedData.push('='.repeat(sheetName.length + 7));
        
        // Process rows
        jsonData.forEach((row: unknown[], rowIndex) => {
          if (Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
            // Convert row to readable format
            const cleanRow = row
              .map(cell => this.formatCellValue(cell))
              .filter(cell => cell.length > 0)
              .join(' | ');
            
            if (cleanRow.length > 0) {
              // Add context for first row (likely headers)
              if (rowIndex === 0 && this.looksLikeHeader(row)) {
                extractedData.push(`Headers: ${cleanRow}`);
              } else {
                extractedData.push(cleanRow);
              }
            }
          }
        });
        
        extractedData.push(''); // Blank line between sheets
      });

      const processingTime = Date.now() - startTime;
      const extractedText = extractedData.join('\n');
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No content found in Excel file');
      }

      console.log(`Excel processed: ${filename}, sheets: ${workbook.SheetNames.length}, time: ${processingTime}ms`);
      
      return this.cleanExcelText(extractedText);
    } catch (error) {
      console.error('Excel processing error:', error);
      throw new Error(`Failed to process Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Format cell value for text extraction
   */
  private formatCellValue(cell: unknown): string {
    if (cell === null || cell === undefined || cell === '') {
      return '';
    }
    
    if (typeof cell === 'string') {
      return cell.trim();
    }
    
    if (typeof cell === 'number') {
      // Handle dates (Excel stores dates as numbers)
      if (cell > 25567 && cell < 50000) { // Rough date range
        try {
          const date = new Date((cell - 25567) * 86400 * 1000);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0]!; // YYYY-MM-DD format
          }
        } catch {
          // Fall back to number
        }
      }
      return cell.toString();
    }
    
    if (typeof cell === 'boolean') {
      return cell ? 'TRUE' : 'FALSE';
    }
    
    return String(cell).trim();
  }

  /**
   * Determine if a row looks like a header row
   */
  private looksLikeHeader(row: unknown[]): boolean {
    if (!Array.isArray(row)) return false;
    
    const nonEmptyCells = row.filter(cell => 
      cell !== null && cell !== undefined && cell !== ''
    );
    
    if (nonEmptyCells.length === 0) return false;
    
    // Check if most cells are strings (typical for headers)
    const stringCells = nonEmptyCells.filter(cell => typeof cell === 'string');
    return stringCells.length / nonEmptyCells.length > 0.7;
  }

  /**
   * Clean extracted Excel text
   */
  private cleanExcelText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Clean up pipe separators
      .replace(/\s*\|\s*/g, ' | ')
      // Remove excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Remove empty lines with just separators
      .replace(/^\s*\|\s*$/gm, '')
      // Trim each line
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .trim();
  }

  /**
   * Validate Excel file before processing
   */
  validateExcelFile(buffer: ArrayBuffer, mimeType: string): { isValid: boolean; error?: string } {
    try {
      // Check minimum size
      if (buffer.byteLength < 512) {
        return { isValid: false, error: 'Excel file too small' };
      }

      if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        return this.validateXlsx(buffer);
      } else if (mimeType === 'application/vnd.ms-excel') {
        return this.validateXls(buffer);
      } else {
        return { isValid: false, error: 'Unsupported Excel format' };
      }
    } catch (error) {
      return { isValid: false, error: `Excel validation error: ${error}` };
    }
  }

  /**
   * Validate .xlsx file (ZIP-based format)
   */
  private validateXlsx(buffer: ArrayBuffer): { isValid: boolean; error?: string } {
    const header = new Uint8Array(buffer.slice(0, 4));
    
    // Check for ZIP header
    if (!(header[0] === 0x50 && header[1] === 0x4B)) {
      return { isValid: false, error: 'Invalid XLSX format (not a ZIP archive)' };
    }

    return { isValid: true };
  }

  /**
   * Validate .xls file (OLE-based format)
   */
  private validateXls(buffer: ArrayBuffer): { isValid: boolean; error?: string } {
    const header = new Uint8Array(buffer.slice(0, 8));
    
    // Check for OLE signature
    const oleSignature = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    
    for (let i = 0; i < 8; i++) {
      if (header[i] !== oleSignature[i]) {
        return { isValid: false, error: 'Invalid XLS format (not an OLE document)' };
      }
    }

    return { isValid: true };
  }

  /**
   * Extract metadata from Excel file
   */
  async extractMetadata(fileBuffer: ArrayBuffer): Promise<{
    sheetCount?: number;
    sheetNames?: string[];
    cellCount?: number;
    hasFormulas?: boolean;
  }> {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      
      let totalCells = 0;
      let hasFormulas = false;
      
      // Count cells and check for formulas
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          return; // Skip if worksheet is undefined
        }
        
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
        totalCells += (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
        
        // Check for formulas (cells starting with '=')
        Object.keys(worksheet).forEach(cellAddress => {
          if (cellAddress.startsWith('!')) return;
          const cell = worksheet[cellAddress];
          if (cell && cell.f) {
            hasFormulas = true;
          }
        });
      });
      
      return {
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
        cellCount: totalCells,
        hasFormulas,
      };
    } catch (error) {
      console.error('Excel metadata extraction error:', error);
      return {};
    }
  }
}
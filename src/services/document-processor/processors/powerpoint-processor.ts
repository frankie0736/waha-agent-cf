import type { DocumentProcessor } from '../types';

export class PowerPointProcessor implements DocumentProcessor {
  readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/vnd.ms-powerpoint' // .ppt
  ];

  async process(fileBuffer: ArrayBuffer, filename: string, mimeType: string): Promise<string> {
    try {
      const startTime = Date.now();
      
      if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        return await this.processPptx(fileBuffer, filename);
      } else if (mimeType === 'application/vnd.ms-powerpoint') {
        return await this.processPpt(fileBuffer, filename);
      } else {
        throw new Error(`Unsupported PowerPoint format: ${mimeType}`);
      }
    } catch (error) {
      console.error('PowerPoint processing error:', error);
      throw new Error(`Failed to process PowerPoint file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process .pptx files
   */
  private async processPptx(fileBuffer: ArrayBuffer, filename: string): Promise<string> {
    try {
      // Import pptx-parser or use JSZip to extract content
      const JSZip = await import('jszip');
      
      const startTime = Date.now();
      const zip = new JSZip.default();
      await zip.loadAsync(fileBuffer);
      
      const extractedText: string[] = [];
      
      // Extract slide content from .pptx structure
      const slideFiles = Object.keys(zip.files)
        .filter(filename => filename.startsWith('ppt/slides/slide') && filename.endsWith('.xml'))
        .sort(); // Sort to maintain slide order

      for (const slideFile of slideFiles) {
        try {
          const slideXml = await zip.files[slideFile]?.async('string');
          if (!slideXml) {
            console.warn(`Could not read slide file ${slideFile}`);
            continue;
          }
          const slideNumber = this.extractSlideNumber(slideFile);
          const slideText = this.extractTextFromSlideXml(slideXml);
          
          if (slideText.trim().length > 0) {
            extractedText.push(`Slide ${slideNumber}:`);
            extractedText.push(slideText);
            extractedText.push(''); // Blank line between slides
          }
        } catch (error) {
          console.warn(`Failed to process slide ${slideFile}:`, error);
        }
      }

      // Also extract notes if present
      const notesFiles = Object.keys(zip.files)
        .filter(filename => filename.startsWith('ppt/notesSlides/notesSlide') && filename.endsWith('.xml'));

      for (const notesFile of notesFiles) {
        try {
          const notesXml = await zip.files[notesFile]?.async('string');
          if (!notesXml) {
            console.warn(`Could not read notes file ${notesFile}`);
            continue;
          }
          const slideNumber = this.extractSlideNumber(notesFile);
          const notesText = this.extractTextFromSlideXml(notesXml);
          
          if (notesText.trim().length > 0) {
            extractedText.push(`Slide ${slideNumber} Notes:`);
            extractedText.push(notesText);
            extractedText.push('');
          }
        } catch (error) {
          console.warn(`Failed to process notes ${notesFile}:`, error);
        }
      }

      const processingTime = Date.now() - startTime;
      const finalText = extractedText.join('\n').trim();
      
      if (!finalText || finalText.length === 0) {
        throw new Error('No text content found in PowerPoint presentation');
      }

      console.log(`PPTX processed: ${filename}, slides: ${slideFiles.length}, time: ${processingTime}ms`);
      
      return this.cleanPowerPointText(finalText);
    } catch (error) {
      console.error('PPTX processing error:', error);
      throw error;
    }
  }

  /**
   * Process legacy .ppt files (limited support)
   */
  private async processPpt(fileBuffer: ArrayBuffer, filename: string): Promise<string> {
    try {
      // For .ppt files, we provide very basic text extraction
      // This is limited due to the complex binary format
      
      const buffer = Buffer.from(fileBuffer);
      let text = '';
      
      // Simple heuristic text extraction
      for (let i = 0; i < buffer.length - 10; i++) {
        // Look for text blocks in the binary data
        let potentialText = '';
        let consecutiveReadable = 0;
        
        for (let j = i; j < Math.min(i + 1000, buffer.length); j++) {
          const char = buffer[j];
          
          if (char !== undefined && ((char >= 32 && char <= 126) || char === 10 || char === 13)) {
            potentialText += String.fromCharCode(char);
            consecutiveReadable++;
          } else if (char !== undefined && (char === 0 || char === 9)) {
            potentialText += ' ';
            consecutiveReadable = 0;
          } else {
            if (consecutiveReadable > 10 && potentialText.trim().length > 20) {
              text += potentialText.trim() + '\n';
            }
            potentialText = '';
            consecutiveReadable = 0;
          }
        }
      }

      const cleanedText = this.cleanPowerPointText(text);
      
      if (!cleanedText || cleanedText.length < 50) {
        throw new Error('Unable to extract meaningful text from legacy .ppt file. Please convert to .pptx format for better results.');
      }

      console.log(`PPT processed (basic): ${filename}`);
      
      return cleanedText;
    } catch (error) {
      console.error('PPT processing error:', error);
      throw new Error('Legacy .ppt files have limited support. Please convert to .pptx format for better extraction.');
    }
  }

  /**
   * Extract slide number from file path
   */
  private extractSlideNumber(filePath: string): number {
    const match = filePath.match(/slide(\d+)/);
    return match?.[1] ? parseInt(match[1], 10) : 1;
  }

  /**
   * Extract text content from PowerPoint slide XML
   */
  private extractTextFromSlideXml(xml: string): string {
    const textElements: string[] = [];
    
    // Simple regex-based XML parsing (more robust than full XML parser for our needs)
    // Look for <a:t> elements which contain the actual text
    const textMatches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
    
    textMatches.forEach(match => {
      const textContent = match.replace(/<a:t[^>]*>([^<]*)<\/a:t>/, '$1');
      if (textContent.trim().length > 0) {
        // Decode XML entities
        const decodedText = textContent
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        
        textElements.push(decodedText.trim());
      }
    });
    
    // Also look for paragraph text in <a:p> elements
    const paragraphMatches = xml.match(/<a:p[^>]*>.*?<\/a:p>/gs) || [];
    
    paragraphMatches.forEach(paragraph => {
      const innerTextMatches = paragraph.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
      const paragraphText = innerTextMatches
        .map(match => match.replace(/<a:t[^>]*>([^<]*)<\/a:t>/, '$1'))
        .join(' ')
        .trim();
      
      if (paragraphText.length > 0 && !textElements.includes(paragraphText)) {
        textElements.push(paragraphText);
      }
    });
    
    return textElements.join('\n').trim();
  }

  /**
   * Clean extracted PowerPoint text
   */
  private cleanPowerPointText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Clean up slide separators
      .replace(/^Slide \d+:$/gm, '\n$&')
      // Remove bullet point artifacts
      .replace(/^[•·▪▫‣⁃]\s*/gm, '• ')
      // Normalize quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Remove extra spaces around punctuation
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/([.,!?;:])\s+/g, '$1 ')
      // Remove common PowerPoint artifacts
      .replace(/Click to edit Master title style/gi, '')
      .replace(/Click to edit Master text styles/gi, '')
      .replace(/Click to add text/gi, '')
      // Trim each line and remove empty lines
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .trim();
  }

  /**
   * Validate PowerPoint file before processing
   */
  validatePowerPointFile(buffer: ArrayBuffer, mimeType: string): { isValid: boolean; error?: string } {
    try {
      if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        return this.validatePptx(buffer);
      } else if (mimeType === 'application/vnd.ms-powerpoint') {
        return this.validatePpt(buffer);
      } else {
        return { isValid: false, error: 'Unsupported PowerPoint format' };
      }
    } catch (error) {
      return { isValid: false, error: `PowerPoint validation error: ${error}` };
    }
  }

  /**
   * Validate .pptx file
   */
  private validatePptx(buffer: ArrayBuffer): { isValid: boolean; error?: string } {
    const header = new Uint8Array(buffer.slice(0, 4));
    
    // Check for ZIP header
    if (!(header[0] === 0x50 && header[1] === 0x4B)) {
      return { isValid: false, error: 'Invalid PPTX format (not a ZIP archive)' };
    }

    // Check minimum size
    if (buffer.byteLength < 2048) {
      return { isValid: false, error: 'PPTX file too small' };
    }

    return { isValid: true };
  }

  /**
   * Validate .ppt file
   */
  private validatePpt(buffer: ArrayBuffer): { isValid: boolean; error?: string } {
    const header = new Uint8Array(buffer.slice(0, 8));
    
    // Check for OLE signature
    const oleSignature = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    
    for (let i = 0; i < 8; i++) {
      if (header[i] !== oleSignature[i]) {
        return { isValid: false, error: 'Invalid PPT format (not an OLE document)' };
      }
    }

    return { isValid: true };
  }

  /**
   * Extract metadata from PowerPoint file
   */
  async extractMetadata(fileBuffer: ArrayBuffer, mimeType: string): Promise<{
    slideCount?: number;
    hasNotes?: boolean;
    hasImages?: boolean;
  }> {
    try {
      if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        const JSZip = await import('jszip');
        const zip = new JSZip.default();
        await zip.loadAsync(fileBuffer);
        
        const slideFiles = Object.keys(zip.files)
          .filter(filename => filename.startsWith('ppt/slides/slide') && filename.endsWith('.xml'));
        
        const notesFiles = Object.keys(zip.files)
          .filter(filename => filename.startsWith('ppt/notesSlides/'));
        
        const imageFiles = Object.keys(zip.files)
          .filter(filename => filename.startsWith('ppt/media/'));
        
        return {
          slideCount: slideFiles.length,
          hasNotes: notesFiles.length > 0,
          hasImages: imageFiles.length > 0,
        };
      } else {
        // Return empty object to avoid exactOptionalPropertyTypes issues
        return {};
      }
    } catch (error) {
      console.error('PowerPoint metadata extraction error:', error);
      return {};
    }
  }
}
/**
 * Humanization Service
 * 
 * Provides sophisticated humanization features for message replies
 * including WPM-based typing delays, intelligent message segmentation,
 * and configurable behavior parameters.
 */

export interface HumanizationConfig {
  // Typing speed configuration
  minWPM: number;           // Minimum words per minute (default: 20)
  maxWPM: number;           // Maximum words per minute (default: 60)
  
  // Delay configuration (in milliseconds)
  minThinkingDelay: number; // Min delay before typing starts (default: 500)
  maxThinkingDelay: number; // Max delay before typing starts (default: 2000)
  minSegmentDelay: number;  // Min delay between segments (default: 800)
  maxSegmentDelay: number;  // Max delay between segments (default: 2000)
  postTypingDelay: number;  // Delay after typing stops (default: 400)
  
  // Segmentation configuration
  maxSegmentLength: number; // Max characters per segment (default: 1000)
  preferredSegmentLength: number; // Preferred segment length (default: 500)
  
  // Behavior configuration
  enableTypingIndicator: boolean; // Show typing indicator (default: true)
  enableRandomVariation: boolean; // Add random variations (default: true)
  maxRetries: number;            // Max send retries (default: 3)
  retryDelay: number;            // Delay between retries (default: 1000)
}

const DEFAULT_CONFIG: HumanizationConfig = {
  minWPM: 20,
  maxWPM: 60,
  minThinkingDelay: 500,
  maxThinkingDelay: 2000,
  minSegmentDelay: 800,
  maxSegmentDelay: 2000,
  postTypingDelay: 400,
  maxSegmentLength: 1000,
  preferredSegmentLength: 500,
  enableTypingIndicator: true,
  enableRandomVariation: true,
  maxRetries: 3,
  retryDelay: 1000
};

export class HumanizationService {
  private config: HumanizationConfig;
  
  constructor(config: Partial<HumanizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Calculate typing duration based on WPM
   */
  calculateTypingDuration(text: string): number {
    // Count words (rough estimate: 5 chars = 1 word)
    const wordCount = text.length / 5;
    
    // Random WPM within configured range
    const wpm = this.config.enableRandomVariation
      ? this.randomFloat(this.config.minWPM, this.config.maxWPM)
      : (this.config.minWPM + this.config.maxWPM) / 2;
    
    // Calculate duration in milliseconds
    const durationMinutes = wordCount / wpm;
    const durationMs = durationMinutes * 60 * 1000;
    
    // Add some natural variation (±10%)
    if (this.config.enableRandomVariation) {
      const variation = durationMs * 0.1;
      return Math.round(durationMs + this.randomFloat(-variation, variation));
    }
    
    return Math.round(durationMs);
  }
  
  /**
   * Calculate thinking delay before typing starts
   */
  calculateThinkingDelay(text: string): number {
    // Longer texts might need more "thinking" time
    const complexity = Math.min(text.length / 100, 1); // 0-1 scale
    
    const baseDelay = this.config.minThinkingDelay + 
      (this.config.maxThinkingDelay - this.config.minThinkingDelay) * complexity;
    
    if (this.config.enableRandomVariation) {
      return this.randomInt(
        Math.max(this.config.minThinkingDelay, baseDelay * 0.8),
        Math.min(this.config.maxThinkingDelay, baseDelay * 1.2)
      );
    }
    
    return Math.round(baseDelay);
  }
  
  /**
   * Intelligently segment messages for natural conversation flow
   */
  segmentMessage(text: string): string[] {
    const segments: string[] = [];
    
    // If text is short enough, return as single segment
    if (text.length <= this.config.preferredSegmentLength) {
      return [text];
    }
    
    // Split by paragraphs first
    const paragraphs = text.split(/\n\n+/);
    
    for (const paragraph of paragraphs) {
      if (paragraph.length <= this.config.maxSegmentLength) {
        // If paragraph fits in max length, try to keep it together
        if (segments.length > 0 && 
            segments[segments.length - 1].length + paragraph.length + 2 <= this.config.maxSegmentLength) {
          // Append to previous segment if it fits
          segments[segments.length - 1] += '\n\n' + paragraph;
        } else {
          segments.push(paragraph);
        }
      } else {
        // Split long paragraph by sentences
        const sentences = this.splitBySentences(paragraph);
        let currentSegment = '';
        
        for (const sentence of sentences) {
          if (sentence.length > this.config.maxSegmentLength) {
            // Very long sentence - split by preferred length
            if (currentSegment) {
              segments.push(currentSegment.trim());
              currentSegment = '';
            }
            segments.push(...this.splitLongText(sentence));
          } else if (currentSegment.length + sentence.length > this.config.preferredSegmentLength) {
            // Start new segment
            if (currentSegment) {
              segments.push(currentSegment.trim());
            }
            currentSegment = sentence;
          } else {
            // Add to current segment
            currentSegment += (currentSegment ? ' ' : '') + sentence;
          }
        }
        
        if (currentSegment) {
          segments.push(currentSegment.trim());
        }
      }
    }
    
    // Merge very short segments
    return this.mergeShortSegments(segments);
  }
  
  /**
   * Split text by sentences
   */
  private splitBySentences(text: string): string[] {
    // Match sentences ending with ., !, ?, or Chinese/Japanese punctuation
    const sentences = text.match(/[^.!?。！？]+[.!?。！？]+/g) || [text];
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
  }
  
  /**
   * Split very long text that doesn't have natural break points
   */
  private splitLongText(text: string): string[] {
    const segments: string[] = [];
    let remaining = text;
    
    while (remaining.length > 0) {
      if (remaining.length <= this.config.preferredSegmentLength) {
        segments.push(remaining);
        break;
      }
      
      // Try to find a good break point (space, comma, etc.)
      let breakPoint = this.config.preferredSegmentLength;
      const searchStart = Math.max(0, breakPoint - 100);
      const chunk = remaining.substring(searchStart, breakPoint + 100);
      
      // Look for natural break points in order of preference
      const breakChars = ['. ', '! ', '? ', ', ', '；', '，', ' ', '、'];
      for (const char of breakChars) {
        const lastIndex = chunk.lastIndexOf(char);
        if (lastIndex !== -1) {
          breakPoint = searchStart + lastIndex + char.length;
          break;
        }
      }
      
      segments.push(remaining.substring(0, breakPoint).trim());
      remaining = remaining.substring(breakPoint).trim();
    }
    
    return segments;
  }
  
  /**
   * Merge segments that are too short
   */
  private mergeShortSegments(segments: string[], minLength: number = 100): string[] {
    const merged: string[] = [];
    let current = '';
    
    for (const segment of segments) {
      if (!current) {
        current = segment;
      } else if (current.length < minLength && 
                 current.length + segment.length <= this.config.maxSegmentLength) {
        // Merge with current
        current += '\n\n' + segment;
      } else {
        // Save current and start new
        merged.push(current);
        current = segment;
      }
    }
    
    if (current) {
      merged.push(current);
    }
    
    return merged;
  }
  
  /**
   * Calculate delay between message segments
   */
  calculateSegmentDelay(prevSegment: string, nextSegment: string): number {
    // Base delay on the complexity/length of the next segment
    const complexity = Math.min(nextSegment.length / 200, 1);
    
    const baseDelay = this.config.minSegmentDelay + 
      (this.config.maxSegmentDelay - this.config.minSegmentDelay) * complexity;
    
    if (this.config.enableRandomVariation) {
      return this.randomInt(
        Math.max(this.config.minSegmentDelay, baseDelay * 0.8),
        Math.min(this.config.maxSegmentDelay, baseDelay * 1.2)
      );
    }
    
    return Math.round(baseDelay);
  }
  
  /**
   * Optimize reply rhythm for better user experience
   */
  optimizeReplyRhythm(segments: string[]): Array<{
    segment: string;
    thinkingDelay: number;
    typingDuration: number;
    postDelay: number;
  }> {
    return segments.map((segment, index) => {
      const isFirst = index === 0;
      const isLast = index === segments.length - 1;
      const prevSegment = index > 0 ? segments[index - 1] : '';
      
      // Calculate delays
      let thinkingDelay: number;
      if (isFirst) {
        // First segment: normal thinking delay
        thinkingDelay = this.calculateThinkingDelay(segment);
      } else {
        // Subsequent segments: use segment delay
        thinkingDelay = this.calculateSegmentDelay(prevSegment, segment);
      }
      
      const typingDuration = this.calculateTypingDuration(segment);
      
      // Post-typing delay (shorter for last segment)
      const postDelay = isLast 
        ? Math.round(this.config.postTypingDelay * 0.5)
        : this.config.postTypingDelay;
      
      return {
        segment,
        thinkingDelay,
        typingDuration,
        postDelay
      };
    });
  }
  
  /**
   * Create retry strategy for failed message sends
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    retryCount: number = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retryCount >= this.config.maxRetries) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const delay = this.config.retryDelay * Math.pow(2, retryCount) + 
                   this.randomInt(0, 500);
      
      console.log(`[humanization] Retry ${retryCount + 1}/${this.config.maxRetries} after ${delay}ms`);
      await this.sleep(delay);
      
      return this.executeWithRetry(fn, retryCount + 1);
    }
  }
  
  /**
   * Utility: Random integer between min and max (inclusive)
   */
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  /**
   * Utility: Random float between min and max
   */
  private randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }
  
  /**
   * Utility: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get configuration
   */
  getConfig(): HumanizationConfig {
    return { ...this.config };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<HumanizationConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Factory function to create humanization service with presets
 */
export function createHumanizationService(preset?: 'fast' | 'normal' | 'slow' | 'custom', customConfig?: Partial<HumanizationConfig>): HumanizationService {
  let config: Partial<HumanizationConfig> = {};
  
  switch (preset) {
    case 'fast':
      config = {
        minWPM: 50,
        maxWPM: 80,
        minThinkingDelay: 300,
        maxThinkingDelay: 1000,
        minSegmentDelay: 500,
        maxSegmentDelay: 1200
      };
      break;
      
    case 'slow':
      config = {
        minWPM: 15,
        maxWPM: 30,
        minThinkingDelay: 1000,
        maxThinkingDelay: 3000,
        minSegmentDelay: 1500,
        maxSegmentDelay: 3000
      };
      break;
      
    case 'custom':
      config = customConfig || {};
      break;
      
    case 'normal':
    default:
      // Use defaults
      break;
  }
  
  return new HumanizationService({ ...config, ...customConfig });
}
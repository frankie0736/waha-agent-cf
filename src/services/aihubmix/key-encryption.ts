import type { EncryptedApiKey } from './types';

/**
 * API Key Encryption Service using AES-256-GCM
 * Provides secure storage and retrieval of API keys in Cloudflare Workers
 */
export class KeyEncryptionService {
  private readonly algorithm = 'AES-GCM';

  constructor(private readonly encryptionSecret: string) {
    if (!encryptionSecret || encryptionSecret.length < 32) {
      throw new Error('Encryption secret must be at least 32 characters long');
    }
  }

  /**
   * Encrypt an API key for secure storage
   */
  async encryptApiKey(apiKey: string, userId: string): Promise<EncryptedApiKey> {
    try {
      // Generate a random initialization vector
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Import the encryption key
      const key = await this.getEncryptionKey();
      
      // Encrypt the API key
      const encoder = new TextEncoder();
      const data = encoder.encode(apiKey);
      
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        key,
        data
      );

      // Extract the encrypted data and authentication tag
      const encryptedArray = new Uint8Array(encryptedData);
      const encryptedKey = encryptedArray.slice(0, -16);
      const tag = encryptedArray.slice(-16);

      return {
        encryptedKey: this.arrayBufferToBase64(encryptedKey),
        iv: this.arrayBufferToBase64(iv),
        tag: this.arrayBufferToBase64(tag),
        createdAt: Date.now(),
        userId
      };
    } catch (error) {
      throw new Error(`Failed to encrypt API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt an API key for use
   */
  async decryptApiKey(encryptedData: EncryptedApiKey): Promise<string> {
    try {
      // Import the encryption key
      const key = await this.getEncryptionKey();
      
      // Convert base64 strings back to arrays
      const iv = this.base64ToArrayBuffer(encryptedData.iv);
      const encryptedKey = this.base64ToArrayBuffer(encryptedData.encryptedKey);
      const tag = this.base64ToArrayBuffer(encryptedData.tag);
      
      // Combine encrypted data and tag
      const encryptedArray = new Uint8Array(encryptedKey);
      const tagArray = new Uint8Array(tag);
      const combined = new Uint8Array(encryptedArray.length + tagArray.length);
      combined.set(encryptedArray);
      combined.set(tagArray, encryptedArray.length);
      
      // Decrypt the data
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: new Uint8Array(iv)
        },
        key,
        combined
      );

      // Convert back to string
      const decoder = new TextDecoder();
      return decoder.decode(decryptedData);
    } catch (error) {
      throw new Error(`Failed to decrypt API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a secure encryption key from the secret
   */
  private async getEncryptionKey(): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.encryptionSecret);
    
    // Hash the secret to get a proper key
    const hash = await crypto.subtle.digest('SHA-256', keyData);
    
    return await crypto.subtle.importKey(
      'raw',
      hash,
      { name: this.algorithm },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte !== undefined) {
        binary += String.fromCharCode(byte);
      }
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Validate that an encrypted key structure is valid
   */
  validateEncryptedKey(encryptedData: unknown): encryptedData is EncryptedApiKey {
    if (!encryptedData || typeof encryptedData !== 'object') {
      return false;
    }
    
    const data = encryptedData as Record<string, unknown>;
    return (
      typeof data.encryptedKey === 'string' &&
      typeof data.iv === 'string' &&
      typeof data.tag === 'string' &&
      typeof data.createdAt === 'number' &&
      typeof data.userId === 'string'
    );
  }

  /**
   * Check if an encrypted key is expired (older than 90 days)
   */
  isKeyExpired(encryptedData: EncryptedApiKey): boolean {
    const expirationTime = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds
    return (Date.now() - encryptedData.createdAt) > expirationTime;
  }
}
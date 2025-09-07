import type {
  CreateSessionResult,
  SessionStatus,
  WAHAApiError,
  WAHAClientOptions,
  WebhookConfig,
} from "./types";

/**
 * Minimal WAHA API client used by workers to manage WhatsApp sessions
 */
export class WAHAClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(apiUrl: string, apiKey: string, options: WAHAClientOptions = {}) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.fetchFn = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  /** Create a new WAHA session and configure webhook */
  async createSession(sessionId: string, webhook: WebhookConfig): Promise<CreateSessionResult> {
    const body = {
      name: sessionId,
      config: {
        webhook: {
          url: webhook.url,
          events: webhook.events ?? ["message", "session.status"],
          hmac: webhook.secret ? { key: webhook.secret } : undefined,
        },
      },
    };

    await this.request("POST", "/api/sessions", body);

    // Try to fetch QR code immediately
    const qrCode = await this.getQRCode(sessionId).catch(() => undefined);
    const result: CreateSessionResult = {
      sessionId,
      status: "connecting",
    };
    if (webhook.secret) {
      result.webhookSecret = webhook.secret;
    }
    if (qrCode) {
      result.qrCode = qrCode;
    }
    return result;
  }

  /** Get current session status */
  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const data = await this.request<{ status?: string; qr?: string; [key: string]: unknown }>(
      "GET",
      `/api/sessions/${sessionId}`
    );
    return {
      sessionId,
      status: data?.status ?? "unknown",
      ...(data?.qr ? { qrCode: data.qr } : {}),
      raw: data,
    };
  }

  /** Fetch a session QR code */
  async getQRCode(sessionId: string): Promise<string> {
    const data = await this.request<{ qr: string }>("GET", `/api/${sessionId}/auth/qr`);
    return data.qr;
  }

  /** Send a text message */
  async sendMessage(sessionId: string, chatId: string, text: string): Promise<void> {
    await this.request("POST", "/api/sendText", {
      session: sessionId,
      chatId,
      text,
    });
  }

  /** Send typing indicator */
  async sendTyping(sessionId: string, chatId: string, duration: number): Promise<void> {
    await this.request("POST", "/api/sendTyping", {
      session: sessionId,
      chatId,
      duration,
    });
  }

  /** Restart a session */
  async restartSession(sessionId: string): Promise<void> {
    await this.request("POST", `/api/sessions/${sessionId}/restart`);
  }

  /** Check server version and compare with required version */
  async ensureVersion(minVersion: string): Promise<void> {
    const info = await this.request<{ version: string }>("GET", "/api/version");
    if (info?.version && this.compareVersions(info.version, minVersion) < 0) {
      throw new Error(`WAHA server version ${info.version} is lower than required ${minVersion}`);
    }
  }

  /** Verify webhook signature using HMAC SHA-256 */
  static async verifyWebhookSignature(
    signature: string,
    body: string,
    secret: string
  ): Promise<boolean> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const digest = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return digest === signature;
  }

  /** Perform HTTP request with timeout and error handling */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(`${this.apiUrl}${path}`, {
        method,
        headers: {
          "X-Api-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal,
      });
      if (!response.ok) {
        const err: WAHAApiError = new Error(`WAHA API Error: ${response.status}`);
        err.status = response.status;
        err.response = response;
        throw err;
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Compare semantic versions */
  private compareVersions(a: string, b: string): number {
    const pa = a.split(".").map((n) => Number.parseInt(n, 10));
    const pb = b.split(".").map((n) => Number.parseInt(n, 10));
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }
}

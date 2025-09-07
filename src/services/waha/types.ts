export interface WAHAClientOptions {
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** WAHA API version, e.g. '2.0.0' */
  version?: string;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}

export interface WebhookConfig {
  url: string;
  /** Events to subscribe to, defaults to ['message', 'session.status'] */
  events?: string[];
  /** Optional HMAC secret for webhook signature */
  secret?: string;
}

export interface CreateSessionResult {
  sessionId: string;
  qrCode?: string;
  status: string;
  webhookSecret?: string;
}

export interface SessionStatus {
  sessionId: string;
  status: string;
  qrCode?: string;
  raw?: unknown;
}

export interface WAHAApiError extends Error {
  status?: number;
  response?: Response;
}

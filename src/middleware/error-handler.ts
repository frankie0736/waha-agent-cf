import type { Context } from "hono";
import type { HTTPResponseError } from "hono/types";

/**
 * API 错误类，用于统一错误处理
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * 预定义的错误类型
 */
export const ApiErrors = {
  // 4xx Client Errors
  BadRequest: (message = "请求参数无效", details?: Record<string, any>) =>
    new ApiError(400, "BAD_REQUEST", message, details),
  
  Unauthorized: (message = "未认证或认证失败") =>
    new ApiError(401, "UNAUTHORIZED", message),
  
  Forbidden: (message = "权限不足") =>
    new ApiError(403, "FORBIDDEN", message),
  
  NotFound: (message = "资源不存在") =>
    new ApiError(404, "NOT_FOUND", message),
  
  Conflict: (message = "资源冲突") =>
    new ApiError(409, "CONFLICT", message),
  
  ValidationError: (message = "数据验证失败", details?: Record<string, any>) =>
    new ApiError(422, "VALIDATION_ERROR", message, details),
  
  RateLimitExceeded: (message = "请求频率超限") =>
    new ApiError(429, "RATE_LIMIT_EXCEEDED", message),

  // 5xx Server Errors
  InternalServerError: (message = "服务器内部错误", details?: Record<string, any>) =>
    new ApiError(500, "INTERNAL_SERVER_ERROR", message, details),
  
  BadGateway: (message = "网关错误") =>
    new ApiError(502, "BAD_GATEWAY", message),
  
  ServiceUnavailable: (message = "服务暂不可用") =>
    new ApiError(503, "SERVICE_UNAVAILABLE", message),
  
  GatewayTimeout: (message = "网关超时") =>
    new ApiError(504, "GATEWAY_TIMEOUT", message),
};

/**
 * 错误响应格式化
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    requestId?: string;
  };
}

/**
 * 格式化错误响应
 */
function formatErrorResponse(
  error: ApiError,
  requestId?: string
): ErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
      timestamp: new Date().toISOString(),
      ...(requestId && { requestId }),
    },
  };
}

/**
 * 全局错误处理中间件
 * 捕获并格式化所有错误响应
 */
export function errorHandler() {
  return async (error: Error | HTTPResponseError, c: Context) => {
    // 生成请求ID用于错误追踪
    const requestId = c.get("requestId") || `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    console.error("API Error:", {
      requestId,
      error: error.message,
      stack: error.stack,
      path: c.req.path,
      method: c.req.method,
      userAgent: c.req.header("user-agent"),
    });

    // 处理 ApiError
    if (error instanceof ApiError) {
      const response = formatErrorResponse(error, requestId);
      return c.json(response, error.statusCode as any);
    }

    // 处理 Zod 验证错误
    if (error.message.includes("validation") || error.message.includes("invalid")) {
      const validationError = ApiErrors.ValidationError(error.message);
      const response = formatErrorResponse(validationError, requestId);
      return c.json(response, validationError.statusCode as any);
    }

    // 处理 HTTP 响应错误
    if ("status" in error && typeof error.status === "number") {
      const httpError = new ApiError(
        error.status,
        "HTTP_ERROR",
        error.message || "HTTP请求错误"
      );
      const response = formatErrorResponse(httpError, requestId);
      return c.json(response, httpError.statusCode as any);
    }

    // 默认处理为内部服务器错误
    const internalError = ApiErrors.InternalServerError(
      c.env?.ENVIRONMENT === "development" ? error.message : "服务器内部错误"
    );
    const response = formatErrorResponse(internalError, requestId);
    return c.json(response, internalError.statusCode as any);
  };
}

/**
 * 异步处理包装器，自动捕获异步错误
 */
export function asyncHandler<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return (...args: T): Promise<R> => {
    return Promise.resolve(handler(...args)).catch((error) => {
      throw error instanceof ApiError ? error : ApiErrors.InternalServerError(error.message);
    });
  };
}
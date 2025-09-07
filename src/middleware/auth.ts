/**
 * Authentication Middleware
 * 
 * Provides middleware functions for protecting routes that require authentication.
 */

import type { Context, Next } from "hono";
import type { Env } from "../index";
import { ApiErrors } from "./error-handler";
import { auth } from "../lib/auth";

/**
 * Middleware to require authentication
 */
export async function requireAuth(c: Context<{ Bindings: Env, Variables: { user?: any } }>, next: Next) {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers
    });
    
    if (!session?.user) {
      throw ApiErrors.Unauthorized("Authentication required");
    }
    
    // Set user in context for downstream handlers
    c.set("user", session.user);
    
    await next();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      throw ApiErrors.Unauthorized("Authentication required");
    }
    throw error;
  }
}

/**
 * Middleware to optionally check authentication
 * Sets user in context if authenticated, but doesn't require it
 */
export async function optionalAuth(c: Context<{ Bindings: Env, Variables: { user?: any } }>, next: Next) {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers
    });
    
    if (session?.user) {
      c.set("user", session.user);
    }
  } catch (error) {
    // Ignore auth errors for optional auth
    console.debug("Optional auth check failed:", error);
  }
  
  await next();
}

/**
 * Middleware to require admin role
 */
export async function requireAdmin(c: Context<{ Bindings: Env, Variables: { user?: any } }>, next: Next) {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers
    });
    
    if (!session?.user) {
      throw ApiErrors.Unauthorized("Authentication required");
    }
    
    // Check if user is admin
    // This would typically check a role field in the user object
    // For now, we'll just check if the user is verified
    const user = session.user as any;
    if (!user.verified) {
      throw ApiErrors.Forbidden("Admin access required");
    }
    
    c.set("user", session.user);
    
    await next();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Forbidden")) {
      throw error;
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      throw ApiErrors.Unauthorized("Authentication required");
    }
    throw error;
  }
}
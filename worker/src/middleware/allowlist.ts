import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { ForbiddenError } from "../errors.js";

function originFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * Real access control, not CORS: CORS headers don't stop a non-browser
 * caller from spending the deployer's Electricity Maps quota.
 */
export function createAllowlistMiddleware(allowedOrigins: readonly string[]): MiddlewareHandler {
  const allowed = new Set(allowedOrigins);
  const withCorsHeaders = cors({
    origin: (origin) => (allowed.has(origin) ? origin : undefined),
    allowMethods: ["GET", "OPTIONS"],
  });

  return async (c, next) => {
    const candidate = c.req.header("Origin") ?? originFromReferer(c.req.header("Referer"));
    if (!candidate || !allowed.has(candidate)) {
      throw new ForbiddenError("Origin is not on the allowlist for this API");
    }
    return withCorsHeaders(c, next);
  };
}

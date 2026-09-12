import type { MiddlewareHandler } from "hono";
import { ForbiddenError } from "../errors.js";

function originFromReferer(referer: string): string | undefined {
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * This is real access control, not CORS politeness: the worker spends the
 * deployer's own Electricity Maps quota on every /v1/* request. A caller must
 * present an Origin or Referer header matching the allowlist - there is no
 * exception for missing headers, since that would be the trivial bypass.
 */
export function createAllowlistMiddleware(allowedOrigins: readonly string[]): MiddlewareHandler {
  const allowed = new Set(allowedOrigins);

  return async (c, next) => {
    const originHeader = c.req.header("Origin");
    const refererHeader = c.req.header("Referer");
    const candidate = originHeader ?? (refererHeader ? originFromReferer(refererHeader) : undefined);

    if (!candidate || !allowed.has(candidate)) {
      throw new ForbiddenError("Origin is not on the allowlist for this API");
    }

    c.header("Access-Control-Allow-Origin", candidate);
    c.header("Vary", "Origin");

    if (c.req.method === "OPTIONS") {
      c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type");
      return c.body(null, 204);
    }

    await next();
  };
}

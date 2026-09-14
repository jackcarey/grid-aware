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

// "https://*.example.com" allows any subdomain but not the apex domain itself -
// list that separately if it also needs access.
function wildcardToRegExp(pattern: string): RegExp | undefined {
  const marker = "://*.";
  const markerIndex = pattern.indexOf(marker);
  if (markerIndex === -1) return undefined;
  const scheme = pattern.slice(0, markerIndex);
  const domain = pattern.slice(markerIndex + marker.length);
  if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme) || !domain) return undefined;
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${scheme}://([a-z0-9-]+\\.)+${escapedDomain}$`, "i");
}

/**
 * Real access control, not CORS: CORS headers don't stop a non-browser
 * caller from spending the deployer's Electricity Maps quota.
 */
export function createAllowlistMiddleware(allowedOrigins: readonly string[]): MiddlewareHandler {
  const exact = new Set<string>();
  const wildcards: RegExp[] = [];
  for (const pattern of allowedOrigins) {
    const regExp = wildcardToRegExp(pattern);
    if (regExp) wildcards.push(regExp);
    else exact.add(pattern);
  }
  const isAllowed = (origin: string) => exact.has(origin) || wildcards.some((regExp) => regExp.test(origin));

  const withCorsHeaders = cors({
    origin: (origin) => (isAllowed(origin) ? origin : undefined),
    allowMethods: ["GET", "OPTIONS"],
  });

  return async (c, next) => {
    const candidate = c.req.header("Origin") ?? originFromReferer(c.req.header("Referer"));
    if (!candidate || !isAllowed(candidate)) {
      throw new ForbiddenError("Origin is not on the allowlist for this API");
    }
    return withCorsHeaders(c, next);
  };
}

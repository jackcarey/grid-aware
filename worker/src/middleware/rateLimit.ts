import type { MiddlewareHandler } from "hono";
import { TooManyRequestsError } from "../errors.js";
import type { AppEnv } from "../ports.js";

export function createRateLimitMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const deps = c.get("deps");
    if (await deps.isOverApiRateLimit()) {
      throw new TooManyRequestsError("Rate limit exceeded for this API");
    }
    await next();
  };
}

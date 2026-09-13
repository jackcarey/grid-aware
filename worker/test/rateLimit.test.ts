import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { ApiError, errorBody } from "../src/errors.js";
import { createRateLimitMiddleware } from "../src/middleware/rateLimit.js";
import type { AppDeps, AppEnv } from "../src/ports.js";
import { createInMemoryCacheStore } from "../src/ports.js";

function buildApp(isOverApiRateLimit: () => Promise<boolean>): Hono<AppEnv> {
  const deps: AppDeps = {
    electricityMapsToken: undefined,
    getCountry: () => undefined,
    getPostcode: () => undefined,
    getCity: () => undefined,
    getRegion: () => undefined,
    getColo: () => undefined,
    isOverRegionalRateLimit: async () => false,
    isOverApiRateLimit,
    cache: createInMemoryCacheStore(),
  };

  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json(errorBody(err), err.status as 429);
    throw err;
  });
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });
  app.use("*", createRateLimitMiddleware());
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

describe("createRateLimitMiddleware", () => {
  it("passes requests through under the limit", async () => {
    const app = buildApp(async () => false);
    const res = await app.request("/");
    expect(res.status).toBe(200);
  });

  it("blocks with 429 once the shared global limit is exceeded", async () => {
    const app = buildApp(async () => true);
    const res = await app.request("/");
    expect(res.status).toBe(429);
  });
});

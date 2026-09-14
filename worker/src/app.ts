import { OpenAPIHono } from "@hono/zod-openapi";
import { ApiError, errorBody } from "./errors.js";
import { createAllowlistMiddleware } from "./middleware/allowlist.js";
import { createRateLimitMiddleware } from "./middleware/rateLimit.js";
import type { AppDeps, AppEnv } from "./ports.js";
import { registerIntensityRoute } from "./routes/intensity.js";
import { registerZonesRoute } from "./routes/zones.js";

export function createApp(deps: AppDeps): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(errorBody(err), err.status as 400 | 403 | 429 | 502);
    }
    return c.json({ error: { message: "Internal error" } }, 500);
  });

  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "grid-aware",
      version: "1.0.1",
      description:
        "Combined global (Electricity Maps) and UK-regional (NESO) grid carbon intensity API.",
    },
  });

  app.use("/v1/*", createAllowlistMiddleware(deps.allowedOrigins));
  app.use("/v1/*", createRateLimitMiddleware());
  registerIntensityRoute(app);
  registerZonesRoute(app);

  return app;
}

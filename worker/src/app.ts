import { OpenAPIHono } from "@hono/zod-openapi";
import packageJson from "../package.json";
import { ApiError, errorBody } from "./errors.js";
import { createAllowlistMiddleware } from "./middleware/allowlist.js";
import { createRateLimitMiddleware } from "./middleware/rateLimit.js";
import type { AppDeps, AppEnv } from "./ports.js";
import { registerIntensityRoute } from "./routes/intensity.js";
import { registerZonesRoute } from "./routes/zones.js";

/** Builds the API app with its routes and middleware, wired to the given dependencies. */
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
      version: packageJson.version,
      description:
        "Combined global (Electricity Maps) and UK-regional (NESO) grid carbon intensity API.",
    },
  });

  // /v1 keeps its 1.x response shapes; point callers at the same request on /v2.
  app.use("/v1/*", async (c, next) => {
    await next();
    const { pathname, search } = new URL(c.req.url);
    c.res = new Response(c.res.body, c.res);
    c.res.headers.set("Deprecation", "true");
    c.res.headers.set("Link", `<${pathname.replace(/^\/v1\//, "/v2/")}${search}>; rel="successor-version"`);
  });
  for (const path of ["/v1/*", "/v2/*"]) {
    app.use(path, createAllowlistMiddleware(deps.allowedOrigins));
    app.use(path, createRateLimitMiddleware());
  }
  registerIntensityRoute(app);
  registerZonesRoute(app);

  return app;
}

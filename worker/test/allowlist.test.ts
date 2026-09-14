import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { ApiError, errorBody } from "../src/errors.js";
import { createAllowlistMiddleware } from "../src/middleware/allowlist.js";

function buildApp(allowedOrigins: string[]): Hono {
  const app = new Hono();
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json(errorBody(err), err.status as 403);
    throw err;
  });
  app.use("*", createAllowlistMiddleware(allowedOrigins));
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

describe("createAllowlistMiddleware", () => {
  it("allows a matching Origin", async () => {
    const app = buildApp(["https://example.com"]);
    const res = await app.request("/", { headers: { Origin: "https://example.com" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
  });

  it("allows a matching Referer when Origin is absent", async () => {
    const app = buildApp(["https://example.com"]);
    const res = await app.request("/", { headers: { Referer: "https://example.com/page" } });
    expect(res.status).toBe(200);
  });

  it("rejects a mismatched Origin", async () => {
    const app = buildApp(["https://example.com"]);
    const res = await app.request("/", { headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("rejects requests with neither Origin nor Referer (no bypass)", async () => {
    const app = buildApp(["https://example.com"]);
    const res = await app.request("/");
    expect(res.status).toBe(403);
  });

  it("handles OPTIONS preflight for an allowed origin", async () => {
    const app = buildApp(["https://example.com"]);
    const res = await app.request("/", {
      method: "OPTIONS",
      headers: { Origin: "https://example.com" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("rejects OPTIONS preflight for a disallowed origin", async () => {
    const app = buildApp(["https://example.com"]);
    const res = await app.request("/", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });
});

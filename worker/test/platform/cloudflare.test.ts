/// <reference types="@cloudflare/vitest-pool-workers/types" />
import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "../../src/platform/cloudflare.js";
import {
  createCloudflareCacheStore,
  getCountry,
  getPostcode,
  isOverRegionalRateLimit,
} from "../../src/platform/cloudflare.js";

describe("getCountry", () => {
  it("reads request.cf.country when present", () => {
    const request = new Request("https://worker.example/", {
      cf: { country: "GB" },
    } as RequestInit);
    expect(getCountry(request)).toBe("GB");
  });

  it("is undefined when cf is absent", () => {
    const request = new Request("https://worker.example/");
    expect(getCountry(request)).toBeUndefined();
  });
});

describe("getPostcode", () => {
  it("reads cf.postalCode and delegates to toOutwardPostcode", () => {
    const request = new Request("https://worker.example/", {
      cf: { postalCode: "SW1A 1AA" },
    } as RequestInit);
    expect(getPostcode(request)).toBe("SW1A");
  });

  it("is undefined when cf is absent", () => {
    const request = new Request("https://worker.example/");
    expect(getPostcode(request)).toBeUndefined();
  });
});

describe("createCloudflareCacheStore", () => {
  it("round-trips a response through caches.default", async () => {
    const ctx = createExecutionContext();
    const store = createCloudflareCacheStore(ctx);
    const key = `https://worker.example/cache-test-${crypto.randomUUID()}`;

    expect(await store.get(key)).toBeUndefined();

    await store.set(
      key,
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
      60,
    );
    await waitOnExecutionContext(ctx);

    const cached = await store.get(key);
    expect(cached).toBeDefined();
    expect(await cached?.json()).toEqual({ ok: true });
  });
});

describe("isOverRegionalRateLimit", () => {
  it("flips to true once the binding's own limit (1 per 60s) is exceeded", async () => {
    const rateLimiter = (env as Env).GB_REGIONAL_RATE_LIMITER;
    expect(await isOverRegionalRateLimit(rateLimiter)).toBe(false);
    expect(await isOverRegionalRateLimit(rateLimiter)).toBe(true);
  });
});

describe("static assets", () => {
  it("serves the docs page at /", async () => {
    const res = await (env as Env).ASSETS.fetch(
      new Request("https://worker.example/"),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("grid-aware");
    expect(body).toContain('id="api-reference"');
    expect(body).toContain(
      'import { initGridAware } from "/grid-aware/index.js"',
    );
  });

  it("serves the bundled widget JS at /grid-aware/index.js", async () => {
    const res = await (env as Env).ASSETS.fetch(
      new Request("https://worker.example/grid-aware/index.js"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("javascript");
    const body = await res.text();
    expect(body).toContain("initGridAware");
  });
});

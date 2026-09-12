import { afterEach, describe, expect, it, vi } from "vitest";

describe("browser.ts (module auto-init)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    document.documentElement.removeAttribute("data-grid-aware");
    document.body.innerHTML = "";
  });

  it("finds its own script tag via data-api-base-url, since document.currentScript is null for modules", async () => {
    const script = document.createElement("script");
    script.type = "module";
    script.dataset.apiBaseUrl = "https://example.com";
    script.dataset.zone = "FR";
    document.body.appendChild(script);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              source: "electricitymaps",
              location: { zone: "FR", region: { unknown: true } },
              datetime: "2026-01-01T00:00:00.000Z",
              carbonIntensity: { value: 10, unit: "gCO2eq/kWh", type: "estimated", band: "low" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await import("../src/browser.js");
    await vi.waitFor(() => expect(document.documentElement.dataset.gridAware).toBe("low"));
  });

  it("logs an error when no script tag has data-api-base-url", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/browser.js");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no <script> tag with a data-api-base-url attribute was found"),
    );
  });
});

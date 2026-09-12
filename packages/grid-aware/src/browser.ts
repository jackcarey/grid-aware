import { initGridAware } from "./index.js";

// document.currentScript is always null for a module script (per spec), so this
// widget's own <script> tag is found by its required config attribute instead.
const currentScript = document.querySelector<HTMLScriptElement>("script[data-api-base-url]");
const apiBaseUrl = currentScript?.dataset.apiBaseUrl;

if (!apiBaseUrl) {
  console.error(
    "grid-aware: no <script> tag with a data-api-base-url attribute was found",
  );
} else {
  const regionid = currentScript?.dataset.regionid
    ? Number(currentScript.dataset.regionid)
    : undefined;
  const maxAgeMs = currentScript?.dataset.maxAgeMs
    ? Number(currentScript.dataset.maxAgeMs)
    : undefined;
  const autoRefresh =
    currentScript?.dataset.autoRefresh !== undefined
      ? currentScript.dataset.autoRefresh !== "false"
      : undefined;

  initGridAware({
    apiBaseUrl,
    zone: currentScript?.dataset.zone,
    postcode: currentScript?.dataset.postcode,
    regionid,
    maxAgeMs,
    autoRefresh,
  });
}

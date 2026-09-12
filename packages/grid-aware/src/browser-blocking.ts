import { initGridAwareBlocking } from "./index.js";

// document.currentScript only resolves for a non-module script
// this entry point must be loaded as a plain <script>, not type="module".
const currentScript = document.currentScript as HTMLScriptElement | null;
const apiBaseUrl = currentScript?.dataset.apiBaseUrl;

if (!apiBaseUrl) {
  console.error(
    "grid-aware: <script> tag is missing a required data-api-base-url attribute",
  );
} else {
  const regionid = currentScript?.dataset.regionid ? Number(currentScript.dataset.regionid) : undefined;
  const maxAgeMs = currentScript?.dataset.maxAgeMs
    ? Number(currentScript.dataset.maxAgeMs)
    : undefined;

  initGridAwareBlocking({
    apiBaseUrl,
    zone: currentScript?.dataset.zone,
    postcode: currentScript?.dataset.postcode,
    regionid,
    maxAgeMs,
  });
}

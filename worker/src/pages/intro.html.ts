export const introHtml = `<h1>grid-aware</h1>
<p>
  A small API that combines <a href="https://electricitymaps.com">Electricity Maps</a>
  (global) with the UK
  <a href="https://carbonintensity.org.uk">NESO Carbon Intensity API</a> (DNO region) behind one normalized endpoint.
</p>
<p>
  Read about the scope and caveats on the <a href="https://jackcarey.co.uk/projects/grid-aware/">project page</a> and <a href="https://jackcarey.co.uk/contact/?subject=grid-aware">get in touch</a> with questions or feedback.
</p>

<p id="live-intensity">Current grid intensity: <strong id="live-intensity-value">loading&hellip;</strong></p>
<script type="module">
  import { initGridAware } from "/grid-aware/index.js";
  const valueEl = document.getElementById("live-intensity-value");
  const liveQueryEl = document.getElementById("live-query");
  initGridAware({
    apiBaseUrl: location.origin,
    // No zone given - the worker defaults to the visitor's Cloudflare-detected location (though any location signals from the server host could be passed in)
    // (UK postcode where available, else just their country).
    mapBand: (data) => {
      const where = data.location.region.name ?? data.location.zone ?? "your area";
      valueEl.textContent = where + ": " + data.carbonIntensity.value + " gCO2eq/kWh (" + data.carbonIntensity.band + ")";
      if (liveQueryEl) {
        liveQueryEl.textContent = "zone=" + data.location.zone;
      }
      return data.carbonIntensity.band;
    },
  });

  // Static HTML can't know this deployment's own URL ahead of time.
  for (const el of document.querySelectorAll(".this-worker-url")) {
    el.textContent = location.origin;
  }
</script>

<h2>Try it</h2>
<pre>curl '<span class="this-worker-url">https://your-deployed-url.com</span>/v1/intensity?<span id="live-query">zone=FR</span>' \\
  -H 'Origin: https://your-allowed-site.example'</pre>
<p>
  Data endpoints (<code>/v1/*</code>) require the calling origin to be on this deployment's
  allowlist, to protect its own Electricity Maps quota - <a href="https://jackcarey.co.uk/contact/?subject=grid-aware">get in touch</a> to have yours added or <a href="https://github.com/jackcarey/grid-aware">deploy the code yourself</a>.
</p>

<h2>Use it on a page</h2>
<p>
  The <a href="https://jsr.io/@web-components/grid-aware">@web-components/grid-aware</a> package
  sets a <code>data-grid-aware</code> attribute on <code>&lt;html&gt;</code> reflecting the
  current intensity band, which your CSS and scripts can respond to:
</p>
<pre>&lt;script type="module"
        src="https://esm.sh/jsr/@web-components/grid-aware/browser"
        data-api-base-url="<span class="this-worker-url">https://your-deployed-url.com</span>"&gt;&lt;/script&gt;

&lt;style&gt;
  html[data-grid-aware="high"] video { display: none; }
&lt;/style&gt;</pre>
<p>
  This is a JS module, so it's deferred by the browser and the band gets applied
  after the page has already started rendering; it can flash default styling. To avoid that, a plain (non-module) blocking build is available to place early
  in <code>&lt;head&gt;</code>. It fetches synchronously and sets <code>data-grid-aware</code>
  before the rest of the page paints, at the cost of stalling the page load on the first request (a cached response is used on subsequent loads):
</p>
<pre>&lt;script src="<span class="this-worker-url">https://your-deployed-url.com</span>/grid-aware/blocking.js"
        data-api-base-url="<span class="this-worker-url">https://your-deployed-url.com</span>"&gt;&lt;/script&gt;</pre>
`;

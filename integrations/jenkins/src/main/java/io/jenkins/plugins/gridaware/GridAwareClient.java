package io.jenkins.plugins.gridaware;

import edu.umd.cs.findbugs.annotations.CheckForNull;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;
import java.util.logging.Logger;
import jenkins.util.Timer;
import net.sf.json.JSONObject;

/**
 * Fetches and caches the API's answers. The queue calls the dispatcher while holding its lock, so
 * {@link #peekSuggestion} never touches the network: it answers from the cache and refreshes in the
 * background.
 */
public final class GridAwareClient {

    private static final Logger LOGGER = Logger.getLogger(GridAwareClient.class.getName());
    private static final GridAwareClient INSTANCE = new GridAwareClient(Clock.systemUTC());

    public static final Duration TTL = Duration.ofMinutes(15);
    /** Failures retry sooner than the TTL, but not on every queue pass. */
    static final Duration RETRY = Duration.ofMinutes(1);

    /** Everything that decides which response a caller gets. */
    public record Settings(String apiUrl, String origin, Location location) {
        String key() {
            return apiUrl + "|" + origin + "|" + location.toQuery();
        }
    }

    /** The API's {@code /v2/suggest} answer: when the best window starts, never earlier than the time it was asked. */
    public record Suggestion(Instant start, @CheckForNull Instant end, @CheckForNull Double averageIntensity) {}

    @FunctionalInterface
    private interface Loader<T> {
        T load() throws IOException, InterruptedException;
    }

    private record Entry(@CheckForNull Object value, Instant refreshAfter) {}

    private final HttpClient http =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final Map<String, Entry> cache = new ConcurrentHashMap<>();
    private final Set<String> inFlight = ConcurrentHashMap.newKeySet();
    private final Clock clock;

    GridAwareClient(Clock clock) {
        this.clock = clock;
    }

    public static GridAwareClient get() {
        return INSTANCE;
    }

    /**
     * The cached suggestion, or empty if there isn't one yet. Starts a background refresh when it is stale.
     * {@code band} is the API name of the good-enough band. Callers should pass {@code withinMinutes} in whole
     * half-hours so that requests share a cache entry.
     */
    public Optional<Suggestion> peekSuggestion(Settings settings, int durationMinutes, int withinMinutes, String band) {
        return peek(
                suggestKey(settings, durationMinutes, withinMinutes, band),
                () -> fetchSuggestion(settings, durationMinutes, withinMinutes, band));
    }

    /** Blocking version of {@link #peekSuggestion}, for tests and callers that can wait. */
    public Suggestion suggestion(Settings settings, int durationMinutes, int withinMinutes, String band)
            throws IOException, InterruptedException {
        return cached(
                suggestKey(settings, durationMinutes, withinMinutes, band),
                () -> fetchSuggestion(settings, durationMinutes, withinMinutes, band));
    }

    /** Blocking lookup of the current intensity, for the pipeline step. */
    public GridIntensity intensity(Settings settings) throws IOException, InterruptedException {
        return cached("intensity|" + settings.key(), () -> fetchIntensity(settings));
    }

    public void clear() {
        cache.clear();
    }

    private static String suggestKey(Settings settings, int durationMinutes, int withinMinutes, String band) {
        return "suggest|" + settings.key() + "|" + durationMinutes + "|" + withinMinutes + "|" + band;
    }

    @SuppressWarnings("unchecked")
    private <T> Optional<T> peek(String key, Loader<T> loader) {
        Entry entry = cache.get(key);
        if (entry == null || !clock.instant().isBefore(entry.refreshAfter())) {
            refreshInBackground(key, loader);
        }
        return entry == null ? Optional.empty() : Optional.ofNullable((T) entry.value());
    }

    @SuppressWarnings("unchecked")
    private <T> T cached(String key, Loader<T> loader) throws IOException, InterruptedException {
        Entry entry = cache.get(key);
        if (entry != null && entry.value() != null && clock.instant().isBefore(entry.refreshAfter())) {
            return (T) entry.value();
        }
        return fetchAndStore(key, loader);
    }

    private <T> void refreshInBackground(String key, Loader<T> loader) {
        if (!inFlight.add(key)) return;
        Timer.get().submit(() -> {
            try {
                fetchAndStore(key, loader);
            } catch (IOException e) {
                LOGGER.log(Level.WARNING, "Grid lookup failed, builds will not be held: {0}", e.toString());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                inFlight.remove(key);
            }
        });
    }

    private <T> T fetchAndStore(String key, Loader<T> loader) throws IOException, InterruptedException {
        try {
            T fetched = loader.load();
            cache.put(key, new Entry(fetched, clock.instant().plus(TTL)));
            return fetched;
        } catch (IOException | RuntimeException e) {
            // Keep the last good answer, if any, so a blip doesn't release held builds.
            Entry previous = cache.get(key);
            cache.put(key, new Entry(previous == null ? null : previous.value(), clock.instant().plus(RETRY)));
            throw e instanceof IOException io ? io : new IOException("Unexpected response: " + e, e);
        }
    }

    private Suggestion fetchSuggestion(Settings settings, int durationMinutes, int withinMinutes, String band)
            throws IOException, InterruptedException {
        String query = "duration=" + durationMinutes + "&within=" + withinMinutes + "&band=" + band;
        String location = settings.location().toQuery();
        return parseSuggestion(get(settings, "/v2/suggest", location.isEmpty() ? query : location + "&" + query));
    }

    private GridIntensity fetchIntensity(Settings settings) throws IOException, InterruptedException {
        return parseIntensity(get(settings, "/v2/intensity", settings.location().toQuery()));
    }

    private String get(Settings settings, String path, String query) throws IOException, InterruptedException {
        String base = settings.apiUrl().replaceAll("/+$", "");
        URI uri = URI.create(base + path + (query.isEmpty() ? "" : "?" + query));
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(10))
                .header("Accept", "application/json")
                // The API only answers origins on its allowlist, and Jenkins sends none of its own.
                .header("Origin", settings.origin())
                .GET()
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IOException("GET " + uri.getPath() + " returned HTTP " + response.statusCode());
        }
        return response.body();
    }

    static Suggestion parseSuggestion(String body) throws IOException {
        JSONObject root = JSONObject.fromObject(body);
        Instant start = instant(root, "start");
        if (start == null) throw new IOException("The suggestion had no start time");
        Double average = root.get("averageIntensity") instanceof Number n ? n.doubleValue() : null;
        return new Suggestion(start, instant(root, "end"), average);
    }

    static GridIntensity parseIntensity(String body) {
        JSONObject intensity = JSONObject.fromObject(body).optJSONObject("carbonIntensity");
        Band band = Band.fromApi(text(intensity, "band"));
        Double value = intensity != null && intensity.get("value") instanceof Number n ? n.doubleValue() : null;
        return new GridIntensity(band, value);
    }

    @CheckForNull
    private static String text(@CheckForNull JSONObject object, String key) {
        return object != null && object.get(key) instanceof String s ? s : null;
    }

    @CheckForNull
    private static Instant instant(@CheckForNull JSONObject object, String key) {
        String text = text(object, key);
        if (text == null) return null;
        try {
            return OffsetDateTime.parse(text).toInstant();
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}

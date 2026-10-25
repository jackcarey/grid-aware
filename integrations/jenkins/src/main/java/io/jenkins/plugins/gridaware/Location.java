package io.jenkins.plugins.gridaware;

import edu.umd.cs.findbugs.annotations.CheckForNull;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Where to ask about. Mirrors the API's zone / postcode / regionid query; the API lets postcode win.
 * With nothing set the API guesses from the caller's IP, which for Jenkins is the controller.
 */
public record Location(@CheckForNull String zone, @CheckForNull String postcode, @CheckForNull Integer regionId) {

    public static final Location AUTO = new Location(null, null, null);

    public static Location of(@CheckForNull String zone, @CheckForNull String postcode, @CheckForNull Integer regionId) {
        return new Location(blankToNull(zone), blankToNull(postcode), regionId);
    }

    public boolean isAuto() {
        return zone == null && postcode == null && regionId == null;
    }

    public String toQuery() {
        StringBuilder query = new StringBuilder();
        append(query, "zone", zone);
        append(query, "postcode", postcode);
        append(query, "regionid", regionId == null ? null : regionId.toString());
        return query.toString();
    }

    private static void append(StringBuilder query, String key, @CheckForNull String value) {
        if (value == null) return;
        if (query.length() > 0) query.append('&');
        query.append(key).append('=').append(URLEncoder.encode(value, StandardCharsets.UTF_8));
    }

    @CheckForNull
    private static String blankToNull(@CheckForNull String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

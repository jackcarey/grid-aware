package io.jenkins.plugins.gridaware;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class GridAwareClientTest {

    @Test
    void parsesASuggestion() throws Exception {
        GridAwareClient.Suggestion parsed = GridAwareClient.parseSuggestion("""
                {"start":"2026-10-25T13:00:00.000Z","end":"2026-10-25T14:30:00.000Z",
                 "averageIntensity":95,"unit":"gCO2eq/kWh","durationMinutes":90,"attribution":[]}
                """);

        assertEquals(Instant.parse("2026-10-25T13:00:00Z"), parsed.start());
        assertEquals(Instant.parse("2026-10-25T14:30:00Z"), parsed.end());
        assertEquals(95.0, parsed.averageIntensity());
    }

    @Test
    void aSuggestionNeedsOnlyAStart() throws Exception {
        GridAwareClient.Suggestion parsed = GridAwareClient.parseSuggestion("{\"start\":\"2026-10-25T13:00:00.000Z\"}");

        assertNull(parsed.end());
        assertNull(parsed.averageIntensity());
    }

    @Test
    void aSuggestionWithoutAStartIsAnError() {
        assertThrows(IOException.class, () -> GridAwareClient.parseSuggestion("{\"unit\":\"gCO2eq/kWh\"}"));
    }

    @Test
    void parsesBandAndValue() {
        GridIntensity parsed = GridAwareClient.parseIntensity("{\"carbonIntensity\":{\"value\":182,\"band\":\"high\"}}");

        assertEquals(Band.HIGH, parsed.band());
        assertEquals(182.0, parsed.value());
    }

    @Test
    void toleratesNullsAndMissingSections() {
        GridIntensity parsed = GridAwareClient.parseIntensity("{\"carbonIntensity\":{\"value\":null,\"band\":\"unknown\"}}");

        assertEquals(Band.UNKNOWN, parsed.band());
        assertNull(parsed.value());
        assertEquals(Band.UNKNOWN, GridAwareClient.parseIntensity("{}").band());
    }

    @Test
    void unknownBandIsNeverDirty() {
        assertFalse(Band.UNKNOWN.exceeds(Band.LOW));
        assertTrue(Band.VERY_HIGH.exceeds(Band.HIGH));
        assertFalse(Band.MODERATE.exceeds(Band.MODERATE));
    }

    @Test
    void locationBuildsQueryAndTreatsBlankAsUnset() {
        assertTrue(Location.of(" ", "", null).isAuto());
        assertEquals("postcode=SW1A&regionid=13", Location.of(null, "SW1A", 13).toQuery());
    }

    @Test
    void lookAheadIsTheTimeLeftInWholeHalfHoursCappedAtTheApiLimit() {
        assertEquals(330, GridAwareDispatcher.withinMinutes(Duration.ofMinutes(359)));
        assertEquals(0, GridAwareDispatcher.withinMinutes(Duration.ofMinutes(29)));
        assertEquals(2880, GridAwareDispatcher.withinMinutes(Duration.ofMinutes(9000)));
    }

    @Test
    void jobLengthIsJenkinsEstimateElseTheDefaultInWholeHalfHours() {
        assertEquals(30, GridAwareDispatcher.durationMinutes(-1, 30));
        assertEquals(60, GridAwareDispatcher.durationMinutes(-1, 45));
        assertEquals(120, GridAwareDispatcher.durationMinutes(95 * 60_000L, 30));
        assertEquals(30, GridAwareDispatcher.durationMinutes(1_000, 30));
        assertEquals(2880, GridAwareDispatcher.durationMinutes(10_000 * 60_000L, 30));
    }
}

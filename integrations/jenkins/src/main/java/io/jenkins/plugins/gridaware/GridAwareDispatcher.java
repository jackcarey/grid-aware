package io.jenkins.plugins.gridaware;

import edu.umd.cs.findbugs.annotations.CheckForNull;
import hudson.Extension;
import hudson.model.Cause;
import hudson.model.Job;
import hudson.model.Queue;
import hudson.model.queue.CauseOfBlockage;
import hudson.model.queue.QueueTaskDispatcher;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Keeps jobs in the queue until a window at or below the good-enough band, or the cleanest one if there is
 * none, before their deadline. A held build uses no
 * executor, and other jobs are unaffected because the queue is not first-in-first-out.
 */
@Extension
public class GridAwareDispatcher extends QueueTaskDispatcher {

    private static final Logger LOGGER = Logger.getLogger(GridAwareDispatcher.class.getName());
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    /** The API forecasts in half-hours, and whole half-hours let requests share a cache entry. */
    static final int BUCKET_MINUTES = 30;

    private static final int MAX_MINUTES = 2880;

    /** Queue item ids this dispatcher is currently holding, for the global cap. */
    private final Set<Long> held = ConcurrentHashMap.newKeySet();

    /** Items already reported as "would hold" in a dry run, so the log gets one line per item. */
    private final Set<Long> dryRunLogged = ConcurrentHashMap.newKeySet();

    private Clock clock = Clock.systemUTC();

    void setClock(Clock clock) {
        this.clock = clock;
    }

    /** How far ahead to look: the time left, in whole half-hours and within the API's limit. */
    static int withinMinutes(Duration remaining) {
        long minutes = remaining.toMinutes() / BUCKET_MINUTES * BUCKET_MINUTES;
        return (int) Math.min(MAX_MINUTES, minutes);
    }

    /** The job length to ask for: Jenkins's estimate if it has one, else the default, in whole half-hours. */
    static int durationMinutes(long estimatedMillis, int defaultMinutes) {
        long minutes = estimatedMillis > 0 ? (estimatedMillis + 59_999) / 60_000 : defaultMinutes;
        long rounded = (minutes + BUCKET_MINUTES - 1) / BUCKET_MINUTES * BUCKET_MINUTES;
        return (int) Math.max(BUCKET_MINUTES, Math.min(MAX_MINUTES, rounded));
    }

    @Override
    @CheckForNull
    public CauseOfBlockage canRun(Queue.Item item) {
        GridAwareGlobalConfiguration config = GridAwareGlobalConfiguration.get();
        // Only the job itself, not the node blocks inside a Pipeline, or a pipeline would wait at every stage.
        if (!config.isEnabled() || !(item.task instanceof Job<?, ?> job)) return release(item);

        GridAwareJobProperty property = job.getProperty(GridAwareJobProperty.class);
        if (property != null && property.isOptOut()) return release(item);
        if (config.isManualBypass() && isManual(item)) return release(item);

        GridAwareClient.Settings settings = config.settings(property == null ? null : property.location());
        if (settings == null) return release(item);

        Band goodEnough = property != null && property.getMaxBand() != null
                ? GridAwareJobProperty.parseLimit(property.getMaxBand(), config.maxBandOrDefault())
                : config.maxBandOrDefault();
        int delayMinutes = property != null && property.getMaxDelayMinutes() != null
                ? property.getMaxDelayMinutes()
                : config.getMaxDelayMinutes();

        Instant now = clock.instant();
        Instant deadline = Instant.ofEpochMilli(item.getInQueueSince()).plus(Duration.ofMinutes(delayMinutes));
        if (!now.isBefore(deadline)) return release(item);

        // Less than a period left: no later window could be reached.
        int within = withinMinutes(Duration.between(now, deadline));
        if (within < BUCKET_MINUTES) return release(item);

        int duration = durationMinutes(item.task.getEstimatedDuration(), config.getDefaultJobMinutes());

        // No answer yet (first call, or the API is down): let the build through rather than guess.
        Optional<GridAwareClient.Suggestion> suggestion =
                GridAwareClient.get().peekSuggestion(settings, duration, within, goodEnough.apiName());
        if (suggestion.isEmpty()) return release(item);
        GridAwareClient.Suggestion best = suggestion.get();

        // The suggestion is never earlier than when it was asked, so a start in the past means now.
        if (!best.start().isAfter(now)) return release(item);

        if (!held.contains(item.getId()) && atCap(config)) return release(item);

        Instant until = best.start().isBefore(deadline) ? best.start() : deadline;
        Blockage blockage = new Blockage(best, until);

        if (config.isDryRun()) {
            // Logged once per item: the queue asks on every pass.
            if (dryRunLogged.size() > 1000) dryRunLogged.clear();
            if (dryRunLogged.add(item.getId())) {
                LOGGER.log(Level.INFO, "Dry run: would hold {0}. {1}", new Object[] {job.getFullName(), blockage.getShortDescription()});
            }
            return null;
        }

        held.add(item.getId());
        return blockage;
    }

    @CheckForNull
    private CauseOfBlockage release(Queue.Item item) {
        held.remove(item.getId());
        dryRunLogged.remove(item.getId());
        return null;
    }

    private boolean atCap(GridAwareGlobalConfiguration config) {
        int cap = config.getMaxGatedItems();
        if (cap <= 0) return false;
        // Cancelled items never reach release(), so drop ids the queue no longer has.
        Queue queue = Queue.getInstance();
        held.removeIf(id -> queue.getItem(id) == null);
        return held.size() >= cap;
    }

    private static boolean isManual(Queue.Item item) {
        for (Cause cause : item.getCauses()) {
            if (cause instanceof Cause.UserIdCause) return true;
        }
        return false;
    }

    static final class Blockage extends CauseOfBlockage {
        private final String message;

        Blockage(GridAwareClient.Suggestion best, Instant until) {
            String average = best.averageIntensity() == null ? "" : ", about " + Math.round(best.averageIntensity()) + " gCO2eq/kWh";
            this.message = "Waiting for a cleaner time on the grid (best window starts "
                    + WHEN.format(best.start().atZone(ZoneId.systemDefault())) + average + "); will run by "
                    + WHEN.format(until.atZone(ZoneId.systemDefault()));
        }

        @Override
        public String getShortDescription() {
            return message;
        }
    }
}

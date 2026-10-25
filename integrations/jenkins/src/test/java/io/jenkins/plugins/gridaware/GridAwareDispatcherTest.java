package io.jenkins.plugins.gridaware;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import hudson.model.FreeStyleProject;
import hudson.model.Queue;
import hudson.model.queue.CauseOfBlockage;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jvnet.hudson.test.JenkinsRule;
import org.jvnet.hudson.test.junit.jupiter.WithJenkins;

@WithJenkins
class GridAwareDispatcherTest {

    private final AtomicReference<String> start = new AtomicReference<>();
    private final AtomicReference<String> origin = new AtomicReference<>();
    private final AtomicReference<String> query = new AtomicReference<>();
    private HttpServer server;
    private JenkinsRule jenkins;
    private GridAwareDispatcher dispatcher;

    @BeforeEach
    void setUp(JenkinsRule rule) throws Exception {
        jenkins = rule;
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v2/suggest", exchange -> {
            origin.set(exchange.getRequestHeaders().getFirst("Origin"));
            query.set(exchange.getRequestURI().getQuery());
            byte[] bytes = ("{\"start\":\"" + start.get() + "\",\"unit\":\"gCO2eq/kWh\"}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();

        GridAwareClient.get().clear();
        GridAwareGlobalConfiguration config = GridAwareGlobalConfiguration.get();
        config.setApiUrl("http://127.0.0.1:" + server.getAddress().getPort());
        config.setOrigin("https://ci.example.com");
        config.setEnabled(true);
        config.setMaxBand("moderate");
        config.setMaxDelayMinutes(360);
        config.setDefaultJobMinutes(30);
        config.setManualBypass(true);
        config.setMaxGatedItems(0);
        config.setDryRun(false);
        dispatcher = new GridAwareDispatcher();
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
        GridAwareClient.get().clear();
    }

    @Test
    void holdsUntilTheBestWindowAndSendsTheConfiguredOrigin() throws Exception {
        Queue.Item item = queued(freestyle());
        primed(item, Duration.ofHours(3));

        CauseOfBlockage cause = dispatcher.canRun(item);

        assertNotNull(cause);
        assertTrue(cause.getShortDescription().contains("Waiting for a cleaner time"));
        assertEquals("https://ci.example.com", origin.get());
        // A minute into the queue leaves 359 minutes, so the look-ahead is 330.
        assertEquals("duration=30&within=330&band=moderate", query.get());
    }

    @Test
    void releasesWhenTheBestWindowIsNow() throws Exception {
        Queue.Item item = queued(freestyle());
        primed(item, Duration.ZERO);

        assertNull(dispatcher.canRun(item));
    }

    @Test
    void releasesAtTheDeadline() throws Exception {
        GridAwareGlobalConfiguration.get().setMaxDelayMinutes(0);
        Queue.Item item = queued(freestyle());
        primed(item, Duration.ofHours(3));

        assertNull(dispatcher.canRun(item));
    }

    @Test
    void optedOutJobsAreNeverHeld() throws Exception {
        FreeStyleProject project = freestyle();
        GridAwareJobProperty property = new GridAwareJobProperty();
        property.setOptOut(true);
        project.addProperty(property);
        Queue.Item item = queued(project);
        primed(item, Duration.ofHours(3));

        assertNull(dispatcher.canRun(item));
    }

    @Test
    void dryRunNeverHolds() throws Exception {
        GridAwareGlobalConfiguration.get().setDryRun(true);
        Queue.Item item = queued(freestyle());
        primed(item, Duration.ofHours(3));

        assertNull(dispatcher.canRun(item));
    }

    @Test
    void disabledSwitchReleasesEverything() throws Exception {
        GridAwareGlobalConfiguration.get().setEnabled(false);
        Queue.Item item = queued(freestyle());
        primed(item, Duration.ofHours(3));

        assertNull(dispatcher.canRun(item));
    }

    @Test
    void failsOpenWhenNothingIsCached() throws Exception {
        start.set(Instant.now().plus(Duration.ofHours(3)).toString());
        // First call has no answer yet, so the build is let through while the lookup runs in the background.
        assertNull(dispatcher.canRun(queued(freestyle())));
    }

    private FreeStyleProject freestyle() throws Exception {
        return jenkins.createFreeStyleProject();
    }

    /** Puts the project in the queue without letting it run, by scheduling far in the future. */
    private Queue.Item queued(FreeStyleProject project) {
        project.scheduleBuild2(3600);
        return jenkins.jenkins.getQueue().getItem(project);
    }

    /**
     * Fixes the dispatcher's clock a minute after the item was queued, has the API say the best window
     * starts {@code startsIn} later, and fetches that answer so the dispatcher, which only reads the
     * cache, sees it. Asks the same question the dispatcher will.
     */
    private Instant primed(Queue.Item item, Duration startsIn) throws Exception {
        Instant now = Instant.ofEpochMilli(item.getInQueueSince()).plusSeconds(60);
        dispatcher.setClock(Clock.fixed(now, ZoneOffset.UTC));
        start.set(now.plus(startsIn).toString());

        GridAwareGlobalConfiguration config = GridAwareGlobalConfiguration.get();
        int duration = GridAwareDispatcher.durationMinutes(item.task.getEstimatedDuration(), config.getDefaultJobMinutes());
        int within = GridAwareDispatcher.withinMinutes(Duration.ofMinutes(config.getMaxDelayMinutes()).minusSeconds(60));
        if (within >= GridAwareDispatcher.BUCKET_MINUTES) {
            GridAwareClient.get().suggestion(config.settings(null), duration, within, config.maxBandOrDefault().apiName());
        }
        return now;
    }
}

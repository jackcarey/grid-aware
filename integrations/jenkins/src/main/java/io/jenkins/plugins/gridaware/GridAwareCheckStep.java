package io.jenkins.plugins.gridaware;

import edu.umd.cs.findbugs.annotations.CheckForNull;
import edu.umd.cs.findbugs.annotations.NonNull;
import hudson.Extension;
import hudson.model.Result;
import hudson.model.TaskListener;
import hudson.util.ListBoxModel;
import java.io.IOException;
import java.util.Set;
import jenkins.model.CauseOfInterruption;
import org.jenkinsci.plugins.workflow.steps.FlowInterruptedException;
import org.jenkinsci.plugins.workflow.steps.Step;
import org.jenkinsci.plugins.workflow.steps.StepContext;
import org.jenkinsci.plugins.workflow.steps.StepDescriptor;
import org.jenkinsci.plugins.workflow.steps.StepExecution;
import org.jenkinsci.plugins.workflow.steps.SynchronousNonBlockingStepExecution;
import org.kohsuke.stapler.DataBoundConstructor;
import org.kohsuke.stapler.DataBoundSetter;

/**
 * {@code gridAwareCheck()} returns true when the grid is above the limit right now. It never waits, so it
 * holds no executor. It does not drop work: the build carries on unless {@code result} is set, which is for
 * builds that really can be skipped.
 */
public class GridAwareCheckStep extends Step {

    private String maxBand;
    private String result = "";
    private String zone;
    private String postcode;
    private Integer regionId;
    private boolean dryRun;

    @DataBoundConstructor
    public GridAwareCheckStep() {}

    public boolean isDryRun() {
        return dryRun;
    }

    @DataBoundSetter
    public void setDryRun(boolean dryRun) {
        this.dryRun = dryRun;
    }

    @CheckForNull
    public String getMaxBand() {
        return maxBand;
    }

    @DataBoundSetter
    public void setMaxBand(@CheckForNull String maxBand) {
        this.maxBand = maxBand;
    }

    public String getResult() {
        return result;
    }

    @DataBoundSetter
    public void setResult(String result) {
        this.result = result;
    }

    @CheckForNull
    public String getZone() {
        return zone;
    }

    @DataBoundSetter
    public void setZone(@CheckForNull String zone) {
        this.zone = zone;
    }

    @CheckForNull
    public String getPostcode() {
        return postcode;
    }

    @DataBoundSetter
    public void setPostcode(@CheckForNull String postcode) {
        this.postcode = postcode;
    }

    @CheckForNull
    public Integer getRegionId() {
        return regionId;
    }

    @DataBoundSetter
    public void setRegionId(@CheckForNull Integer regionId) {
        this.regionId = regionId;
    }

    @Override
    public StepExecution start(StepContext context) {
        return new Execution(context, this);
    }

    private static final class Execution extends SynchronousNonBlockingStepExecution<Boolean> {
        private final transient GridAwareCheckStep step;

        Execution(StepContext context, GridAwareCheckStep step) {
            super(context);
            this.step = step;
        }

        @Override
        protected Boolean run() throws Exception {
            TaskListener listener = getContext().get(TaskListener.class);
            GridAwareGlobalConfiguration config = GridAwareGlobalConfiguration.get();
            GridAwareClient.Settings settings = config.settings(Location.of(step.zone, step.postcode, step.regionId));
            if (settings == null) {
                listener.getLogger().println("gridAwareCheck: no API URL configured, continuing");
                return false;
            }
            Band limit = GridAwareJobProperty.parseLimit(step.maxBand, config.maxBandOrDefault());
            GridIntensity intensity;
            try {
                intensity = GridAwareClient.get().intensity(settings);
            } catch (IOException e) {
                listener.getLogger().println("gridAwareCheck: lookup failed, continuing (" + e.getMessage() + ")");
                return false;
            }
            listener.getLogger().println("gridAwareCheck: grid is " + intensity.describe() + ", limit is " + limit.apiName());
            if (!intensity.band().exceeds(limit)) return false;
            if (step.result == null || step.result.isBlank()) {
                listener.getLogger().println("gridAwareCheck: grid is above the limit, continuing");
                return true;
            }
            if (step.dryRun || config.isDryRun()) {
                listener.getLogger().println("gridAwareCheck: dry run, would end the build here as " + step.result);
                return true;
            }
            throw new FlowInterruptedException(
                    Result.fromString(step.result), new GridTooDirty(intensity.describe(), limit));
        }
    }

    private static final class GridTooDirty extends CauseOfInterruption {
        private final String detail;

        GridTooDirty(String reading, Band limit) {
            this.detail = "Grid carbon intensity is " + reading + ", above the " + limit.apiName() + " limit";
        }

        @Override
        public String getShortDescription() {
            return detail;
        }
    }

    @Extension
    public static class DescriptorImpl extends StepDescriptor {

        @Override
        public Set<? extends Class<?>> getRequiredContext() {
            return Set.of(TaskListener.class);
        }

        @Override
        public String getFunctionName() {
            return "gridAwareCheck";
        }

        @NonNull
        @Override
        public String getDisplayName() {
            return "Check whether the grid is carbon-intensive";
        }

        public ListBoxModel doFillMaxBandItems() {
            return GridAwareJobProperty.bandItems(true);
        }

        public ListBoxModel doFillResultItems() {
            ListBoxModel items = new ListBoxModel();
            items.add("Carry on", "");
            items.add("Not built", "NOT_BUILT");
            items.add("Aborted", "ABORTED");
            items.add("Unstable", "UNSTABLE");
            return items;
        }
    }
}

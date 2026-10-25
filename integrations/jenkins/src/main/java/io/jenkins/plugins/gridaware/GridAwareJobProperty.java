package io.jenkins.plugins.gridaware;

import edu.umd.cs.findbugs.annotations.CheckForNull;
import edu.umd.cs.findbugs.annotations.NonNull;
import hudson.Extension;
import hudson.model.Job;
import hudson.model.JobProperty;
import hudson.model.JobPropertyDescriptor;
import hudson.util.ListBoxModel;
import org.jenkinsci.Symbol;
import org.kohsuke.stapler.DataBoundConstructor;
import org.kohsuke.stapler.DataBoundSetter;

/**
 * Per-job overrides. Jobs are held by default, so this is mostly for opting out; blank fields
 * inherit the global setting. Absent entirely means the same as defaults.
 */
public class GridAwareJobProperty extends JobProperty<Job<?, ?>> {

    private boolean optOut;
    private String maxBand;
    private Integer maxDelayMinutes;
    private String zone;
    private String postcode;
    private Integer regionId;

    @DataBoundConstructor
    public GridAwareJobProperty() {}

    public boolean isOptOut() {
        return optOut;
    }

    @DataBoundSetter
    public void setOptOut(boolean optOut) {
        this.optOut = optOut;
    }

    @CheckForNull
    public String getMaxBand() {
        return maxBand;
    }

    @DataBoundSetter
    public void setMaxBand(@CheckForNull String maxBand) {
        this.maxBand = maxBand == null || maxBand.isBlank() ? null : maxBand;
    }

    @CheckForNull
    public Integer getMaxDelayMinutes() {
        return maxDelayMinutes;
    }

    @DataBoundSetter
    public void setMaxDelayMinutes(@CheckForNull Integer maxDelayMinutes) {
        this.maxDelayMinutes = maxDelayMinutes == null ? null : Math.max(0, maxDelayMinutes);
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

    public Location location() {
        return Location.of(zone, postcode, regionId);
    }

    /** Only low, moderate and high make sense as a limit: nothing is dirtier than very-high. */
    static Band parseLimit(@CheckForNull String name, Band fallback) {
        Band band = Band.fromApi(name);
        return band == Band.UNKNOWN || band == Band.VERY_HIGH ? fallback : band;
    }

    static ListBoxModel bandItems(boolean withInherit) {
        ListBoxModel items = new ListBoxModel();
        if (withInherit) items.add("Use global default", "");
        items.add("Low", "low");
        items.add("Moderate", "moderate");
        items.add("High", "high");
        return items;
    }

    @Extension
    @Symbol("gridAware")
    public static class DescriptorImpl extends JobPropertyDescriptor {

        @Override
        public boolean isApplicable(Class<? extends Job> jobType) {
            return true;
        }

        @NonNull
        @Override
        public String getDisplayName() {
            return "Grid-aware builds";
        }

        public ListBoxModel doFillMaxBandItems() {
            return bandItems(true);
        }
    }
}

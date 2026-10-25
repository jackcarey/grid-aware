package io.jenkins.plugins.gridaware;

import edu.umd.cs.findbugs.annotations.CheckForNull;
import edu.umd.cs.findbugs.annotations.NonNull;
import hudson.Extension;
import hudson.util.FormValidation;
import hudson.util.ListBoxModel;
import java.net.URI;
import jenkins.model.GlobalConfiguration;
import jenkins.model.JenkinsLocationConfiguration;
import org.jenkinsci.Symbol;
import org.kohsuke.stapler.DataBoundSetter;
import org.kohsuke.stapler.QueryParameter;

/** Controller-wide settings. Jobs get these unless their {@link GridAwareJobProperty} says otherwise. */
@Extension
@Symbol("gridAware")
public class GridAwareGlobalConfiguration extends GlobalConfiguration {

    public static final String DEFAULT_MAX_BAND = "moderate";
    public static final int DEFAULT_MAX_DELAY_MINUTES = 360;
    public static final int DEFAULT_JOB_MINUTES = 30;

    private boolean enabled = true;
    private String apiUrl;
    private String origin;
    private String zone;
    private String postcode;
    private Integer regionId;
    private String maxBand = DEFAULT_MAX_BAND;
    private int maxDelayMinutes = DEFAULT_MAX_DELAY_MINUTES;
    private int defaultJobMinutes = DEFAULT_JOB_MINUTES;
    private boolean manualBypass = true;
    private int maxGatedItems;
    private boolean dryRun;

    public GridAwareGlobalConfiguration() {
        load();
    }

    @NonNull
    public static GridAwareGlobalConfiguration get() {
        return GlobalConfiguration.all().getInstance(GridAwareGlobalConfiguration.class);
    }

    /** Null until an API URL is set, which leaves gating off rather than guessing a server. */
    @CheckForNull
    public GridAwareClient.Settings settings(@CheckForNull Location override) {
        if (apiUrl == null || apiUrl.isBlank()) return null;
        Location location = override != null && !override.isAuto() ? override : Location.of(zone, postcode, regionId);
        return new GridAwareClient.Settings(apiUrl.trim(), effectiveOrigin(), location);
    }

    private String effectiveOrigin() {
        if (origin != null && !origin.isBlank()) return origin.trim();
        String rootUrl = JenkinsLocationConfiguration.get().getUrl();
        if (rootUrl != null) {
            try {
                URI uri = URI.create(rootUrl);
                if (uri.getScheme() != null && uri.getAuthority() != null) {
                    return uri.getScheme() + "://" + uri.getAuthority();
                }
            } catch (IllegalArgumentException ignored) {
                // fall through to the default
            }
        }
        return "http://localhost:8080";
    }

    public boolean isEnabled() {
        return enabled;
    }

    @DataBoundSetter
    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
        save();
    }

    @CheckForNull
    public String getApiUrl() {
        return apiUrl;
    }

    @DataBoundSetter
    public void setApiUrl(@CheckForNull String apiUrl) {
        this.apiUrl = apiUrl;
        save();
    }

    @CheckForNull
    public String getOrigin() {
        return origin;
    }

    @DataBoundSetter
    public void setOrigin(@CheckForNull String origin) {
        this.origin = origin;
        save();
    }

    @CheckForNull
    public String getZone() {
        return zone;
    }

    @DataBoundSetter
    public void setZone(@CheckForNull String zone) {
        this.zone = zone;
        save();
    }

    @CheckForNull
    public String getPostcode() {
        return postcode;
    }

    @DataBoundSetter
    public void setPostcode(@CheckForNull String postcode) {
        this.postcode = postcode;
        save();
    }

    @CheckForNull
    public Integer getRegionId() {
        return regionId;
    }

    @DataBoundSetter
    public void setRegionId(@CheckForNull Integer regionId) {
        this.regionId = regionId;
        save();
    }

    public String getMaxBand() {
        return maxBand;
    }

    @DataBoundSetter
    public void setMaxBand(@CheckForNull String maxBand) {
        this.maxBand = maxBand == null || maxBand.isBlank() ? DEFAULT_MAX_BAND : maxBand;
        save();
    }

    public int getMaxDelayMinutes() {
        return maxDelayMinutes;
    }

    @DataBoundSetter
    public void setMaxDelayMinutes(int maxDelayMinutes) {
        this.maxDelayMinutes = Math.max(0, maxDelayMinutes);
        save();
    }

    public int getDefaultJobMinutes() {
        return defaultJobMinutes;
    }

    @DataBoundSetter
    public void setDefaultJobMinutes(int defaultJobMinutes) {
        this.defaultJobMinutes = Math.max(1, defaultJobMinutes);
        save();
    }

    public boolean isManualBypass() {
        return manualBypass;
    }

    @DataBoundSetter
    public void setManualBypass(boolean manualBypass) {
        this.manualBypass = manualBypass;
        save();
    }

    public int getMaxGatedItems() {
        return maxGatedItems;
    }

    @DataBoundSetter
    public void setMaxGatedItems(int maxGatedItems) {
        this.maxGatedItems = Math.max(0, maxGatedItems);
        save();
    }

    public boolean isDryRun() {
        return dryRun;
    }

    @DataBoundSetter
    public void setDryRun(boolean dryRun) {
        this.dryRun = dryRun;
        save();
    }

    /** The configured limit as a band, falling back to the default if the stored text is not one. */
    public Band maxBandOrDefault() {
        return GridAwareJobProperty.parseLimit(maxBand, Band.MODERATE);
    }

    public ListBoxModel doFillMaxBandItems() {
        return GridAwareJobProperty.bandItems(false);
    }

    public FormValidation doCheckApiUrl(@QueryParameter String value) {
        if (value == null || value.isBlank()) {
            return FormValidation.warning("Builds are not held until an API URL is set.");
        }
        try {
            URI uri = URI.create(value.trim());
            if (uri.getScheme() == null || uri.getHost() == null) return FormValidation.error("Enter a full URL");
        } catch (IllegalArgumentException e) {
            return FormValidation.error("Not a valid URL");
        }
        return FormValidation.ok();
    }
}

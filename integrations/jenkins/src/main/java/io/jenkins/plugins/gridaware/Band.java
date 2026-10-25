package io.jenkins.plugins.gridaware;

/** Carbon intensity band, ordered cleanest to dirtiest so bands can be compared. */
public enum Band {
    LOW("low"),
    MODERATE("moderate"),
    HIGH("high"),
    VERY_HIGH("very-high"),
    UNKNOWN("unknown");

    private final String apiName;

    Band(String apiName) {
        this.apiName = apiName;
    }

    public String apiName() {
        return apiName;
    }

    public static Band fromApi(String name) {
        for (Band band : values()) {
            if (band.apiName.equals(name)) return band;
        }
        return UNKNOWN;
    }

    /** True when this band is dirtier than {@code limit}. An unknown band never counts as dirty. */
    public boolean exceeds(Band limit) {
        return this != UNKNOWN && compareTo(limit) > 0;
    }
}

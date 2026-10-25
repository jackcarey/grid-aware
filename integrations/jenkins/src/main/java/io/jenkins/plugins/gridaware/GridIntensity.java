package io.jenkins.plugins.gridaware;

import edu.umd.cs.findbugs.annotations.CheckForNull;

/** The parts of a /v2/intensity response the pipeline step uses. */
public record GridIntensity(Band band, @CheckForNull Double value) {

    public String describe() {
        return value == null ? band.apiName() : band.apiName() + ", " + Math.round(value) + " gCO2eq/kWh";
    }
}

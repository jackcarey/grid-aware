import type { Attribution, GridIntensityResponse, IntensityBody } from "./types.js";

// CC BY and the Electricity Maps terms both require saying the data was modified.
export const NESO_ATTRIBUTION: Attribution = {
  source: "neso",
  text: "Carbon intensity data from the NESO Carbon Intensity API, licensed under CC BY 4.0. Normalised by grid-aware.",
  licence: "https://creativecommons.org/licenses/by/4.0/",
  url: "https://carbonintensity.org.uk",
};

export const ELECTRICITY_MAPS_ATTRIBUTION: Attribution = {
  source: "electricitymaps",
  text: "Source: ElectricityMaps.com. Normalised by grid-aware.",
  licence: "https://electricitymaps.com/terms-of-service",
  url: "https://electricitymaps.com",
};

export const CO2JS_ATTRIBUTION: Attribution = {
  source: "co2js",
  text: "Source: ElectricityMaps.com annual averages, licensed under ODbL, via CO2.js by The Green Web Foundation.",
  licence: "https://opendatacommons.org/licenses/odbl/",
  url: "https://www.thegreenwebfoundation.org/co2-js/",
};

const BY_SOURCE: Record<GridIntensityResponse["source"], Attribution> = {
  neso: NESO_ATTRIBUTION,
  electricitymaps: ELECTRICITY_MAPS_ATTRIBUTION,
  co2js: CO2JS_ATTRIBUTION,
};

/** The Elexon credit, dated to the year the data was published. The wording is set by the BMRS licence. */
export function bmrsAttribution(publishTime: string): Attribution {
  const year = new Date(publishTime).getUTCFullYear();
  return {
    source: "bmrs",
    text: `Contains BMRS data © Elexon Limited copyright and database right ${year}`,
    licence: "https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/",
    url: "https://bmrs.elexon.co.uk",
  };
}

/** Adds credits for every source whose data is in the response. An unknown result has none. */
export function withAttribution(body: IntensityBody): GridIntensityResponse {
  const attribution = body.carbonIntensity.type === "unknown" ? [] : [BY_SOURCE[body.source]];
  if (body.surplus?.bmrs) attribution.push(bmrsAttribution(body.surplus.bmrs.publishTime));
  return { ...body, attribution };
}

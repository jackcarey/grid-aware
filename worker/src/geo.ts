export const UK_COUNTRY_CODE = "GB";

export function isUkRequest(country: string | undefined): boolean {
  return country === UK_COUNTRY_CODE;
}

const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}$/;
const UK_OUTWARD_CODE = /^[A-Z]{1,2}\d[A-Z\d]?$/;

/** NESO's regional lookup wants the outward code (e.g. "SW1A"), not a full postcode. */
export function toOutwardPostcode(raw: string): string | undefined {
  const value = raw.trim().toUpperCase();
  const full = value.match(UK_POSTCODE);
  if (full) return full[1];
  return UK_OUTWARD_CODE.test(value) ? value : undefined;
}

import { type ProviderName, UpstreamError } from "../errors.js";

/** Fetches a URL as JSON, throwing UpstreamError if `label` can't be reached or doesn't return OK. */
export async function fetchJson<T>(
  url: string | URL,
  provider: ProviderName,
  label: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new UpstreamError(`Failed to reach ${label}`, provider);
  }
  if (!response.ok) {
    throw new UpstreamError(`${label} responded with ${response.status}`, provider);
  }
  return (await response.json()) as T;
}

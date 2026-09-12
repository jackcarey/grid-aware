import createClient, { type Client } from "openapi-fetch";
import type { paths } from "./client.gen.js";

/** A typed fetch client for a grid-aware worker's API. */
export function createGridAwareClient(baseUrl: string): Client<paths> {
  return createClient<paths>({ baseUrl });
}

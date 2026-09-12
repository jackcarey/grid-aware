import createClient, { type Client } from "openapi-fetch";
import type { paths } from "./client.gen.js";

export function createGridAwareClient(baseUrl: string): Client<paths> {
  return createClient<paths>({ baseUrl });
}

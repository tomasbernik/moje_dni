import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";

export function createMojeDniClient(config) {
  if (!config.authUrl || !config.dataApiUrl) return null;
  return createClient({
    auth: { adapter: SupabaseAuthAdapter(), url: config.authUrl, allowAnonymous: false },
    dataApi: { url: config.dataApiUrl, options: { db: { schema: "public" } } },
  });
}

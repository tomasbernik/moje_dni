import { createClient, SupabaseAuthAdapter } from "https://esm.sh/@neondatabase/neon-js@0.7.0-beta?bundle";

export function createMojeDniClient(config) {
  if (!config.authUrl || !config.dataApiUrl) return null;
  return createClient({
    auth: { adapter: SupabaseAuthAdapter(), url: config.authUrl, allowAnonymous: false },
    dataApi: { url: config.dataApiUrl, options: { db: { schema: "public" } } },
  });
}

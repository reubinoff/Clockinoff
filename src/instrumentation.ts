// Next.js instrumentation entrypoint. Runs once, at server boot, before any
// route handler is loaded. See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// We wire Azure Monitor / Application Insights here so that server-side HTTP
// requests, exceptions, `pg` queries, and `console.*` calls are exported to
// the connection string configured on the App Service (see AGENTS.md
// §14 Deploy to Azure → Application Insights).
//
// - Azure Monitor is a no-op when `APPLICATIONINSIGHTS_CONNECTION_STRING`
//   is unset (local dev, CI).
// - Node-only: the edge / browser runtimes never load the Azure SDK.
// - Hourly expired-session purge (#150) starts on Node boot when
//   DATABASE_URL is set (skipped in test / `next build`).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertOAuthStateSecretInProduction } = await import("./lib/oauth-state");
  assertOAuthStateSecretInProduction();
  // Refuse a production boot whose DATABASE_URL sslmode is disable,
  // no-verify, or missing (#139). Skipped for next build and loopback.
  const { assertProductionDatabaseSslMode } = await import("./server/db/pg-ssl");
  assertProductionDatabaseSslMode(process.env.DATABASE_URL);
  // Hourly expired-session purge (#150). Lives here — not in
  // `instrumentation.node.ts` — because that file only loads when
  // Application Insights is configured. Azure Web App Node always
  // hits this Node-runtime branch of `register()`.
  const { shouldStartSessionPurge, startSessionPurgeLoop } = await import(
    "./server/auth/session-purge"
  );
  if (shouldStartSessionPurge()) startSessionPurgeLoop();
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) return;
  await import("./instrumentation.node");
}

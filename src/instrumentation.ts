// Next.js instrumentation entrypoint. Runs once, at server boot, before any
// route handler is loaded. See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// We wire Azure Monitor / Application Insights here so that server-side HTTP
// requests, exceptions, `pg` queries, and `console.*` calls are exported to
// the connection string configured on the App Service (see README, "Azure
// deployment" → "Application Insights").
//
// - No-op when `APPLICATIONINSIGHTS_CONNECTION_STRING` is unset (local dev, CI).
// - Node-only: the edge / browser runtimes never load the Azure SDK.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) return;
  await import("./instrumentation.node");
}

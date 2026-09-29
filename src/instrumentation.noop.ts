// Edge-runtime stand-in for `src/instrumentation.node.ts`. The Node.js Azure
// Monitor SDK is not usable from the edge runtime and is not needed there
// (see the `NEXT_RUNTIME` guard in `src/instrumentation.ts`), so on the
// edge-server Webpack pass `next.config.mjs` aliases the `.node` module to
// this file instead — keeping heavy `@azure/monitor-opentelemetry` /
// `@opentelemetry/sdk-node` deps (which reference Node built-ins like `fs`,
// `net`, `tls`, `zlib`) out of the edge bundle.
export {};

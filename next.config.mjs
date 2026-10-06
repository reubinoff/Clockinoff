// Baseline security headers applied to every response.
//
// Covers issues #34 / #43 (headers) and #35 / #44 (X-Powered-By suppression —
// see `poweredByHeader: false` below).
//
// - `X-Content-Type-Options: nosniff` blocks MIME sniffing.
// - `X-Frame-Options: DENY` + `Content-Security-Policy: frame-ancestors 'none'`
//   are two overlapping clickjacking mitigations; modern browsers honour the
//   CSP directive, older ones fall back to the legacy header.
// - `Strict-Transport-Security` pins clients to HTTPS in production. The
//   header is harmless over HTTP (browsers ignore it) so we send it
//   unconditionally rather than depending on runtime env-checks in the config.
// - `Referrer-Policy` keeps third-party referers (e.g. clicked links out of
//   the app) from leaking the authenticated path a user came from.
// - `Permissions-Policy` disables camera / microphone / geolocation and
//   other unused powerful APIs (issue #127). The app never asks for them.
// - `Content-Security-Policy` is a *pragmatic* enforce policy, not a locked-
//   down one. See the long comment on `CSP` below for the explicit list of
//   gaps and why they are deliberate for v1.
//
// Why both `X-Frame-Options` and CSP `frame-ancestors`: Chromium / Firefox
// honour `frame-ancestors` and ignore the legacy header when both are
// present; older/embedded browsers (Edge Legacy, in-app webviews) only
// understand the legacy one. Sending both costs ~20 bytes per response and
// removes a class of "which browser is this?" bugs.
//
// Why we still ship HSTS with `preload`: the production domain
// (clockinoff.reubinoff.com) is already preloaded via the parent
// `reubinoff.com` entry. Downgrading to the issue-#43-suggested
// `max-age=31536000; includeSubDomains` would be a *regression* for existing
// clients that have already pinned the longer window, so we hold the
// stronger value and note the delta in the issue thread instead.
//
// Scope: these headers also go out on API JSON responses. That is
// intentional — a JSON endpoint can still be the target of a mis-sniffed
// script tag or an iframe, and the per-route cost of these headers is zero.
const CSP = [
  // Fall-through for every fetch destination that doesn't have a more
  // specific directive below. 'self' only — no third-party CDNs are used.
  "default-src 'self'",
  // Scripts: 'self' + 'unsafe-inline'. The 'unsafe-inline' allowance covers
  //   (a) Next.js App Router's inline runtime (`__NEXT_DATA__` hydration,
  //       Fast Refresh dev bundle), and
  //   (b) the appearance boot script injected via `dangerouslySetInnerHTML`
  //       in `src/app/layout.tsx` + `src/app/global-error.tsx`, which has to
  //       run before first paint so the dark theme doesn't flash.
  // A nonce-based policy would be strictly stronger but requires threading
  // a per-request nonce through every injection point, which the v1 tracer
  // / standalone build does not do yet. Tracked as a follow-up to #43.
  "script-src 'self' 'unsafe-inline'",
  // Styles: 'self' + 'unsafe-inline'. Tailwind compiles to a plain CSS
  // bundle (covered by 'self'), but the auth pages and global-error ship
  // short inline `<style>` blocks and React injects inline styles on a
  // handful of client components (TimerBar, EntryList). Same follow-up as
  // scripts — move to nonces once the runtime supports it.
  "style-src 'self' 'unsafe-inline'",
  // Images: 'self' plus `data:` for the small inline SVG icons React
  // produces and `blob:` for the PDF export preview URL
  // (`URL.createObjectURL(blob)` in `src/components/ExportPanel.tsx`).
  "img-src 'self' data: blob:",
  // Fonts: 'self' only. We bundle the InterVariable + Noto Sans TTFs under
  // `public/` and `src/server/assets/fonts/`; no fonts.googleapis.com.
  "font-src 'self' data:",
  // XHR / fetch / EventSource targets: same origin only. Azure Monitor
  // runs server-side (see `src/instrumentation.node.ts`) so the browser
  // never calls out to it.
  "connect-src 'self'",
  // Clickjacking mitigation — see the `X-Frame-Options` header above.
  "frame-ancestors 'none'",
  // Lock the base URI so an injected `<base>` tag can't rewrite every
  // relative URL on the page to an attacker-controlled host.
  "base-uri 'self'",
  // All <form action> targets go to the Next route handlers on this origin.
  "form-action 'self'",
  // No <object>/<embed> plug-in content — PDFs are downloaded as blobs.
  "object-src 'none'",
].join("; ");

const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "bluetooth=()",
  "display-capture=()",
  "interest-cohort=()",
].join(", ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: CSP },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Drop the `X-Powered-By: Next.js` framework banner (issues #35 and #44).
  poweredByHeader: false,
  // Next 16 clones the request body for `proxy` + the route handler and
  // defaults that buffer to 10 MB. Clockinoff has no uploads; 64 KiB is
  // enough for every JSON route and stops an unauthenticated 10 MB POST
  // from being fully buffered (#151). `readJson` still enforces the same
  // cap and returns 413 — the proxy setting only limits the clone.
  experimental: {
    proxyClientMaxBodySize: "64kb",
    // TypeScript 7 ships a native `tsc` and no compiler API. Next's default
    // typecheck loads `typescript` programmatically and fails closed on 7.x.
    useTypeScriptCli: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // `src/instrumentation.ts` is picked up automatically in Next 15+ — the
  // old `experimental.instrumentationHook` flag was removed in Next 16.
  serverExternalPackages: [
    "@react-pdf/renderer",
    "argon2",
    // OpenTelemetry auto-instrumentation packages patch third-party modules
    // at `require()` time via `require-in-the-middle`. Bundling them through
    // Webpack breaks that patching, so we mark them external and let Node
    // resolve them from `node_modules/` at runtime.
    "@azure/monitor-opentelemetry",
    "@opentelemetry/api",
    "@opentelemetry/api-logs",
    "@opentelemetry/sdk-node",
    "@opentelemetry/instrumentation",
  ],
  // Next's standalone tracer follows JS `require`s, so it misses files that
  // are loaded dynamically at runtime. Known misses on this project:
  //
  // 1. argon2 dynamically loads a prebuilt `.node` binary via `node-gyp-build`.
  //    Without the prebuilds/ tree the deployed bundle throws "No native
  //    build was found ..." on App Service.
  //
  // 2. @react-pdf/renderer → pdfkit (0.20.x) resolves the Standard 14 fonts
  //    through a subpath-imports template `require('#standard-fonts/<Name>')`
  //    which the tracer cannot statically follow. It also reads
  //    `data/sRGB_IEC61966_2_1.icc` at runtime. Without these files the PDF
  //    export route throws `MODULE_NOT_FOUND` for
  //    `pdfkit/js/standard-fonts/Helvetica.cjs` and returns HTTP 500.
  //
  // 3. @azure/monitor-opentelemetry pulls a large tree of `@opentelemetry/*`
  //    instrumentation packages via dynamic `require`, plus native helpers
  //    like `require-in-the-middle` / `import-in-the-middle`. Force the
  //    complete trees into the standalone output so the SDK actually loads
  //    inside App Service.
  //
  // Force the full packages (including their data / prebuilds trees) into
  // the standalone output.
  outputFileTracingIncludes: {
    "*": [
      "./node_modules/argon2/**/*",
      "./node_modules/node-gyp-build/**/*",
      "./node_modules/node-addon-api/**/*",
      "./node_modules/@phc/format/**/*",
      "./node_modules/pdfkit/**/*",
      "./node_modules/@react-pdf/**/*",
      "./node_modules/fontkit/**/*",
      // Noto Sans TTFs used by the PDF export report (`renderReportPdf`).
      // `Font.register` reads them from disk at request time, so they must
      // land in the standalone output alongside the compiled server code.
      "./src/server/assets/fonts/**/*",
      "./node_modules/@azure/monitor-opentelemetry/**/*",
      "./node_modules/@azure/monitor-opentelemetry-exporter/**/*",
      "./node_modules/@azure/core-*/**/*",
      "./node_modules/@azure/identity/**/*",
      "./node_modules/@azure/logger/**/*",
      "./node_modules/@azure/opentelemetry-instrumentation-azure-sdk/**/*",
      "./node_modules/@opentelemetry/**/*",
      "./node_modules/require-in-the-middle/**/*",
      "./node_modules/import-in-the-middle/**/*",
    ],
  },
  async rewrites() {
    return [
      // Pretty URLs for the static, dependency-free unavailable page shipped
      // in `public/unavailable.html`. Useful for status links, upstream
      // health checks, or Front Door / App Gateway custom error rules.
      { source: "/unavailable", destination: "/unavailable.html" },
      { source: "/maintenance", destination: "/unavailable.html" },
      { source: "/503", destination: "/unavailable.html" },
    ];
  },
  // Keep the OpenTelemetry / Azure Monitor SDKs out of the Webpack graph on
  // the server. They rely on dynamic `require()` (via `require-in-the-middle`)
  // to instrument third-party modules, and pull in optional gRPC transports
  // that reference Node built-ins Webpack cannot always resolve
  // (`@grpc/grpc-js` → `net`, `zlib`). Marking them external means the compiled
  // instrumentation entrypoint keeps a plain `require(...)` that Node resolves
  // at runtime from `node_modules/` (which is why the tracing includes above
  // ship the full trees into the standalone output).
  webpack: (config, { isServer, nextRuntime, webpack }) => {
    if (!isServer) return config;
    // We use Azure Monitor's HTTP exporter, not gRPC. `@opentelemetry/sdk-node`
    // eagerly `require`s the gRPC exporter which drags in `@grpc/grpc-js`, and
    // that package references a pile of Node built-ins (`net`, `zlib`, `tls`,
    // `fs`, `stream`) that Webpack's server compilations fail to resolve.
    // Azure Monitor never touches these transports — strip them.
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@grpc\/grpc-js$/ }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^@opentelemetry\/(exporter-trace-otlp-grpc|otlp-grpc-exporter-base)$/,
      }),
    );
    if (nextRuntime === "edge") {
      // On the edge-server compilation (e.g. `/opengraph-image`), redirect the
      // Node-only Azure Monitor bootstrap to an empty stub. The runtime guard
      // in `src/instrumentation.ts` (`NEXT_RUNTIME !== "nodejs"`) already
      // short-circuits before reaching it; the alias keeps the SDK's heavy
      // deps out of the edge bundle so it doesn't try to bundle `fs` / `net`.
      // Same for `oauth-state`: instrumentation dynamically imports the
      // server-only HMAC helpers after the Node check, but webpack still
      // traces the specifier. Stub it so `node:crypto` never enters Edge.
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "./instrumentation.node": false,
        "./lib/oauth-state": false,
        // instrumentation.ts dynamically imports session-purge (node:crypto + DB); Edge must not resolve it.
        "./server/auth/session-purge": false,
      };
      return config;
    }
    // Node.js server: keep OTel / Azure Monitor out of the Webpack graph so
    // `require-in-the-middle` patching works at runtime.
    const otelExternals = ({ request }, callback) => {
      if (
        typeof request === "string" &&
        (request.startsWith("@azure/monitor-opentelemetry") ||
          request.startsWith("@opentelemetry/") ||
          request === "require-in-the-middle" ||
          request === "import-in-the-middle")
      ) {
        return callback(null, `commonjs ${request}`);
      }
      return callback();
    };
    const existing = config.externals;
    if (Array.isArray(existing)) {
      existing.push(otelExternals);
    } else if (existing) {
      config.externals = [existing, otelExternals];
    } else {
      config.externals = [otelExternals];
    }
    return config;
  },
};

export default nextConfig;

// Baseline security headers applied to every response (issues #34 + #35).
//
// - `X-Content-Type-Options: nosniff` blocks MIME sniffing.
// - `X-Frame-Options: DENY` + `Content-Security-Policy: frame-ancestors 'none'`
//   are two overlapping clickjacking mitigations; modern browsers honour the
//   CSP directive, older ones fall back to the legacy header.
// - `Strict-Transport-Security` pins clients to HTTPS in production. The
//   header is harmless over HTTP (browsers ignore it) so we send it
//   unconditionally rather than depending on runtime env-checks in the config.
//
// Intentionally *not* setting `default-src` / `script-src` / `style-src`: a
// stricter CSP would need nonces threaded through the Next.js runtime, and
// v1 does not have that plumbing yet — a broken login page is worse than a
// missing script-src directive.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Drop the `X-Powered-By: Next.js` framework banner (issue #35).
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  experimental: {
    // Enables `src/instrumentation.ts` (Azure Monitor / Application Insights
    // bootstrap). Stable in Next 15; opt-in on 14.
    instrumentationHook: true,
    serverComponentsExternalPackages: [
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
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "./instrumentation.node": false,
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

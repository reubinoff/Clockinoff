/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer", "argon2"],
    // Next's standalone tracer follows JS `require`s, so it misses files that
    // are loaded dynamically at runtime. Two known misses on this project:
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
};

export default nextConfig;

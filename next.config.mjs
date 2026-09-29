/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer", "argon2"],
    // Next's standalone tracer follows JS `require`s, so it misses argon2's
    // prebuilt `.node` binaries (loaded dynamically at runtime via
    // `node-gyp-build`). Without these files the deployed bundle throws
    // "No native build was found ..." on App Service. Force the full argon2
    // package (including prebuilds/) into the standalone output.
    outputFileTracingIncludes: {
      "*": [
        "./node_modules/argon2/**/*",
        "./node_modules/node-gyp-build/**/*",
        "./node_modules/node-addon-api/**/*",
        "./node_modules/@phc/format/**/*",
      ],
    },
  },
};

export default nextConfig;

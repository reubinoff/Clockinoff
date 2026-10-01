// ESLint 9 flat config. Next 16 removed `next lint`, so we drive ESLint
// directly from this file and keep the quality gate identical to the old
// legacy `.eslintrc.json` extends ("next/core-web-vitals").
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      // Rules newly introduced by `eslint-plugin-react-hooks@7`
      // (shipped with eslint-config-next@16). The patterns they flag
      // (reset-on-close, mount flags, filter sync in `useEffect`) are
      // intentional in this codebase; downgrade to warnings so the Next
      // 16 upgrade does not require a parallel effect-refactor.
      "react-hooks/set-state-in-effect": "warn",
      // Introduced by `@next/eslint-plugin-next@16`. The GoogleButton
      // uses `window.location.href` for a hard navigation to a server
      // route that returns an OAuth 302 — `router.push()` would not
      // trigger the browser redirect. Downgrade to a warning.
      "@next/next/no-location-assign-relative-destination": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "drizzle/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

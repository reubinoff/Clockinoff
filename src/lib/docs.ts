// Default to the in-app `/docs` route. The app ships its own copy of the
// user guide (rendered by `src/app/docs/*`) so that the Docs link in the
// shell always resolves on the same public origin, regardless of whether
// the GitHub Pages site under <https://reubinoff.github.io/Clockinoff/>
// is enabled for a given fork. Set `NEXT_PUBLIC_DOCS_URL` to override
// (e.g. point a staging instance at the Pages site, or at a tracked
// draft version of the docs on a preview URL).
export const DOCS_URL: string =
  process.env.NEXT_PUBLIC_DOCS_URL?.trim() || "/docs";

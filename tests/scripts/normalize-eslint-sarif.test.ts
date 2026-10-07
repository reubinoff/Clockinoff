import { describe, expect, it } from "vitest";
import {
  normalizeSarifDocument,
  toRepoRelativeUri,
} from "../../scripts/normalize-eslint-sarif.mjs";

const root = "/home/runner/work/Clockinoff/Clockinoff";

describe("toRepoRelativeUri", () => {
  it("turns an absolute file URL into a repo-relative POSIX path", () => {
    expect(
      toRepoRelativeUri(`file://${root}/src/app/page.tsx`, root),
    ).toBe("src/app/page.tsx");
  });

  it("turns an absolute filesystem path into a repo-relative path", () => {
    expect(toRepoRelativeUri(`${root}/src/lib/tz.ts`, root)).toBe(
      "src/lib/tz.ts",
    );
  });

  it("leaves an already-relative URI unchanged", () => {
    expect(toRepoRelativeUri("src/lib/tz.ts", root)).toBe("src/lib/tz.ts");
  });

  it("leaves https URIs unchanged", () => {
    expect(toRepoRelativeUri("https://eslint.org", root)).toBe(
      "https://eslint.org",
    );
  });

  it("leaves a path outside the repo unchanged", () => {
    expect(toRepoRelativeUri("file:///usr/lib/node/eslint.js", root)).toBe(
      "file:///usr/lib/node/eslint.js",
    );
  });
});

describe("normalizeSarifDocument", () => {
  it("rewrites artifact and result URIs and keeps help URIs", () => {
    const sarif = {
      runs: [
        {
          tool: {
            driver: {
              informationUri: "https://eslint.org",
              rules: [{ id: "no-unused-vars", helpUri: "https://eslint.org/docs" }],
            },
          },
          artifacts: [
            { location: { uri: `file://${root}/src/app/page.tsx` } },
          ],
          results: [
            {
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: {
                      uri: `file://${root}/src/app/page.tsx`,
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const normalized = normalizeSarifDocument(sarif, root) as {
      runs: Array<{
        tool: { driver: { informationUri: string; rules: Array<{ helpUri: string }> } };
        artifacts: Array<{ location: { uri: string } }>;
        results: Array<{
          locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }>;
        }>;
      }>;
    };

    expect(normalized.runs[0].artifacts[0].location.uri).toBe("src/app/page.tsx");
    expect(
      normalized.runs[0].results[0].locations[0].physicalLocation.artifactLocation
        .uri,
    ).toBe("src/app/page.tsx");
    expect(normalized.runs[0].tool.driver.informationUri).toBe("https://eslint.org");
    expect(normalized.runs[0].tool.driver.rules[0].helpUri).toBe(
      "https://eslint.org/docs",
    );
  });
});

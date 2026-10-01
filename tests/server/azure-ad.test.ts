import { afterEach, describe, expect, it, vi } from "vitest";
import type { TokenCredential } from "@azure/identity";
import {
  AZURE_POSTGRES_SCOPE,
  createTokenPasswordProvider,
  isPasswordlessPostgresUrl,
  shouldUseAzureAdAuth,
} from "@/server/db/azure-ad";

function fakeCredential(
  tokens: Array<{ token: string; expiresOnTimestamp: number }>,
): { credential: TokenCredential; getToken: ReturnType<typeof vi.fn> } {
  const getToken = vi.fn(async () => {
    if (tokens.length === 0) {
      throw new Error("no more tokens");
    }
    return tokens.shift()!;
  });
  return { credential: { getToken }, getToken };
}

describe("isPasswordlessPostgresUrl", () => {
  it("accepts a passwordless postgres URL with user component", () => {
    expect(
      isPasswordlessPostgresUrl(
        "postgresql://clockinoff-prod@host.postgres.database.azure.com:5432/db?sslmode=require",
      ),
    ).toBe(true);
    expect(
      isPasswordlessPostgresUrl("postgres://user@host:5432/db"),
    ).toBe(true);
  });

  it("rejects URLs that carry a password", () => {
    expect(
      isPasswordlessPostgresUrl("postgres://timely:timely@localhost:5432/timely"),
    ).toBe(false);
  });

  it("rejects URLs with no user component", () => {
    expect(isPasswordlessPostgresUrl("postgres://host:5432/db")).toBe(false);
  });

  it("rejects non-postgres URLs and junk input", () => {
    expect(isPasswordlessPostgresUrl("mysql://user@host/db")).toBe(false);
    expect(isPasswordlessPostgresUrl("not a url")).toBe(false);
    expect(isPasswordlessPostgresUrl(undefined)).toBe(false);
    expect(isPasswordlessPostgresUrl("")).toBe(false);
  });
});

describe("shouldUseAzureAdAuth", () => {
  const passworded = "postgres://timely:timely@localhost:5432/timely";
  const passwordless =
    "postgresql://clockinoff-prod@host.postgres.database.azure.com:5432/db?sslmode=require";

  it("honours an explicit on flag over the URL shape", () => {
    expect(shouldUseAzureAdAuth(passworded, { PG_AZURE_AD_AUTH: "1" })).toBe(true);
    expect(shouldUseAzureAdAuth(passworded, { PG_AZURE_AD_AUTH: "true" })).toBe(true);
    expect(shouldUseAzureAdAuth(passworded, { PG_AZURE_AD_AUTH: "YES" })).toBe(true);
  });

  it("honours an explicit off flag over the URL shape", () => {
    expect(shouldUseAzureAdAuth(passwordless, { PG_AZURE_AD_AUTH: "0" })).toBe(false);
    expect(shouldUseAzureAdAuth(passwordless, { PG_AZURE_AD_AUTH: "false" })).toBe(false);
    expect(shouldUseAzureAdAuth(passwordless, { PG_AZURE_AD_AUTH: "no" })).toBe(false);
  });

  it("falls back to URL detection when the flag is empty / unknown", () => {
    expect(shouldUseAzureAdAuth(passwordless, {})).toBe(true);
    expect(shouldUseAzureAdAuth(passworded, {})).toBe(false);
    expect(shouldUseAzureAdAuth(passwordless, { PG_AZURE_AD_AUTH: "" })).toBe(true);
    expect(shouldUseAzureAdAuth(passwordless, { PG_AZURE_AD_AUTH: "maybe" })).toBe(true);
  });

  it("ignores URL casing on the flag value", () => {
    expect(shouldUseAzureAdAuth(passworded, { PG_AZURE_AD_AUTH: "  TRUE  " })).toBe(true);
  });
});

describe("createTokenPasswordProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches a token with the Azure Postgres scope by default", async () => {
    const { credential, getToken } = fakeCredential([
      { token: "tok-1", expiresOnTimestamp: Date.now() + 60 * 60_000 },
    ]);
    const getPassword = createTokenPasswordProvider(credential);
    await expect(getPassword()).resolves.toBe("tok-1");
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith(AZURE_POSTGRES_SCOPE);
  });

  it("caches the token until it is close to expiry", async () => {
    const now = { value: 1_000_000 };
    const expiresOnTimestamp = now.value + 60 * 60_000;
    const { credential, getToken } = fakeCredential([
      { token: "tok-A", expiresOnTimestamp },
      { token: "tok-B", expiresOnTimestamp: expiresOnTimestamp + 60 * 60_000 },
    ]);
    const getPassword = createTokenPasswordProvider(credential, {
      now: () => now.value,
      refreshBufferMs: 5 * 60_000,
    });
    await expect(getPassword()).resolves.toBe("tok-A");
    now.value += 10 * 60_000;
    await expect(getPassword()).resolves.toBe("tok-A");
    expect(getToken).toHaveBeenCalledTimes(1);

    now.value = expiresOnTimestamp - 60_000;
    await expect(getPassword()).resolves.toBe("tok-B");
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent token fetches", async () => {
    let resolve!: (v: { token: string; expiresOnTimestamp: number }) => void;
    const getToken = vi.fn(
      async () =>
        new Promise<{ token: string; expiresOnTimestamp: number }>((r) => {
          resolve = r;
        }),
    );
    const credential: TokenCredential = { getToken };
    const getPassword = createTokenPasswordProvider(credential);
    const a = getPassword();
    const b = getPassword();
    resolve({ token: "shared", expiresOnTimestamp: Date.now() + 60 * 60_000 });
    await expect(a).resolves.toBe("shared");
    await expect(b).resolves.toBe("shared");
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it("throws when the credential returns no token", async () => {
    const credential: TokenCredential = {
      getToken: vi.fn(async () => null),
    };
    const getPassword = createTokenPasswordProvider(credential);
    await expect(getPassword()).rejects.toThrow(/no token/i);
  });

  it("retries after a failed fetch instead of caching the rejection", async () => {
    let call = 0;
    const credential: TokenCredential = {
      getToken: vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("boom");
        return {
          token: "recovered",
          expiresOnTimestamp: Date.now() + 60 * 60_000,
        };
      }),
    };
    const getPassword = createTokenPasswordProvider(credential);
    await expect(getPassword()).rejects.toThrow(/boom/);
    await expect(getPassword()).resolves.toBe("recovered");
    expect(credential.getToken).toHaveBeenCalledTimes(2);
  });
});

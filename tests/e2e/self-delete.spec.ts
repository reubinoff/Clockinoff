import { expect, test } from "@playwright/test";
import { forgetQaSweepPassword, qaSweepPrefix, rememberQaSweepPassword } from "../qa-passwords";

const password = "correct-horse-battery";

test("signed-in user deletes only their own account", async ({ page, baseURL }) => {
  const email = `${qaSweepPrefix()}${Date.now()}@ex.com`;
  rememberQaSweepPassword(email, password);
  const origin = baseURL ?? "http://localhost:3000";
  let deleted = false;
  try {
    const registered = await page.request.post("/api/auth/register", {
      data: { email, password },
    });
    expect(registered.ok()).toBeTruthy();

    const removed = await page.request.delete("/api/auth/me", {
      data: { password, confirmEmail: `  ${email.toUpperCase()}  ` },
      headers: { Origin: origin },
    });
    expect(removed.status()).toBe(204);
    deleted = true;

    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(401);
  } finally {
    if (!deleted) {
      await page.request
        .delete("/api/auth/me", {
          data: { password, confirmEmail: email },
          headers: { Origin: origin },
        })
        .catch(() => undefined);
    }
    forgetQaSweepPassword(email);
  }
});

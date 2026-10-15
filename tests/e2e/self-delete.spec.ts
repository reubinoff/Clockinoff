import { expect, test } from "@playwright/test";
import {
  qaSweepPrefix,
  rememberQaSweepPassword,
  setQaSweepDeleter,
  sweepRememberedQaUsers,
} from "../qa-passwords";

const password = "correct-horse-battery";

test.afterEach(async ({ request, baseURL }) => {
  const origin = baseURL ?? "http://localhost:3000";
  setQaSweepDeleter(async (email, pw) => {
    const login = await request.post("/api/auth/login", {
      data: { email, password: pw },
    });
    if (login.status() === 401) return true;
    if (!login.ok()) return false;
    const removed = await request.delete("/api/auth/me", {
      data: { password: pw, confirmEmail: email },
      headers: { Origin: origin },
    });
    const me = await request.get("/api/auth/me");
    return removed.status() === 204 && me.status() === 401;
  });
  try {
    await sweepRememberedQaUsers();
  } finally {
    setQaSweepDeleter(null);
  }
});

test("signed-in user deletes only their own account", async ({ page, baseURL }) => {
  const email = `${qaSweepPrefix()}${Date.now()}@ex.com`;
  rememberQaSweepPassword(email, password);
  const origin = baseURL ?? "http://localhost:3000";
  const registered = await page.request.post("/api/auth/register", {
    data: { email, password },
  });
  expect(registered.ok()).toBeTruthy();

  const removed = await page.request.delete("/api/auth/me", {
    data: { password, confirmEmail: `  ${email.toUpperCase()}  ` },
    headers: { Origin: origin },
  });
  expect(removed.status()).toBe(204);

  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(401);
});

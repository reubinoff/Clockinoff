// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountSettings from "@/components/AccountSettings";
import {
  DELETE_ACCOUNT_COPY,
  deleteAccountErrorCopy,
  GOOGLE_REAUTH_HREF,
} from "@/components/DeleteAccountDialog";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    refresh: nav.refresh,
  }),
  useSearchParams: () => nav.params,
}));

const passwordMethods = {
  hasPassword: true,
  googleConnected: false,
  googleEmail: null,
};

const googleMethods = {
  hasPassword: false,
  googleConnected: true,
  googleEmail: "ada@example.com",
};

function renderAccount(
  overrides: Partial<{
    isAdmin: boolean;
    sessionFresh: boolean;
    hasPassword: boolean;
  }> = {},
): void {
  const hasPassword = overrides.hasPassword ?? true;
  render(
    <AccountSettings
      email="Ada@Example.com"
      methods={hasPassword ? passwordMethods : googleMethods}
      isAdmin={overrides.isAdmin ?? false}
      sessionFresh={overrides.sessionFresh ?? true}
    />,
  );
}

function openSheet(): void {
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
}

function dialogConfirm(): HTMLElement {
  return within(screen.getByRole("dialog")).getByRole("button", { name: "Delete account" });
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.refresh.mockReset();
  nav.params = new URLSearchParams();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("delete account error copy", () => {
  it("maps #193 statuses onto the locked strings", () => {
    expect(deleteAccountErrorCopy(400, "Email confirmation does not match")).toBe(
      DELETE_ACCOUNT_COPY.emailMismatch,
    );
    expect(deleteAccountErrorCopy(401, "Invalid email or password")).toBe(
      DELETE_ACCOUNT_COPY.wrongPassword,
    );
    expect(deleteAccountErrorCopy(401, "reauth_required")).toBe(DELETE_ACCOUNT_COPY.reauthRequired);
    expect(deleteAccountErrorCopy(429, "Too many attempts. Please try again later.")).toBe(
      DELETE_ACCOUNT_COPY.rateLimit,
    );
    expect(deleteAccountErrorCopy(403, "You can’t remove an admin.")).toBe(DELETE_ACCOUNT_COPY.admin);
    expect(deleteAccountErrorCopy(403, "Forbidden")).toBe(DELETE_ACCOUNT_COPY.generic);
    expect(deleteAccountErrorCopy(500, "Internal server error")).toBe(DELETE_ACCOUNT_COPY.failed);
  });
});

describe("Account danger zone", () => {
  it("shows an outline Delete account control and does not call the API until the sheet confirms", () => {
    renderAccount();
    expect(screen.getByRole("heading", { name: "Danger zone" })).toBeTruthy();
    expect(screen.getByText(DELETE_ACCOUNT_COPY.zoneHelper)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    openSheet();
    expect(screen.getByRole("dialog", { name: DELETE_ACCOUNT_COPY.title })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    for (const line of DELETE_ACCOUNT_COPY.bullets) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps Delete disabled until the email matches, with no error while typing", () => {
    renderAccount();
    openSheet();
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    const email = screen.getByLabelText(DELETE_ACCOUNT_COPY.emailLabel) as HTMLInputElement;
    expect(password.getAttribute("autocomplete")).toBe("current-password");
    expect(email.value).toBe("");
    expect(email.placeholder).toBe("Ada@Example.com");
    const confirm = dialogConfirm();
    expect(confirm).toBeDisabled();
    fireEvent.change(password, { target: { value: "correct-horse" } });
    fireEvent.change(email, { target: { value: "nope@example.com" } });
    expect(confirm).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(email, { target: { value: "  ada@example.com  " } });
    expect(confirm).toBeEnabled();
  });

  it("clears the password on cancel and on a wrong-password 401, then focuses the empty field", async () => {
    renderAccount();
    openSheet();
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.change(password, { target: { value: "wrong-secret" } });
    fireEvent.change(screen.getByLabelText(DELETE_ACCOUNT_COPY.emailLabel), {
      target: { value: "ada@example.com" },
    });
    vi.mocked(fetch).mockResolvedValue({
      status: 401,
      json: async () => ({ error: { code: "UNAUTHORIZED", message: "Invalid email or password" } }),
    } as Response);
    fireEvent.click(dialogConfirm());
    expect(await screen.findByRole("alert")).toHaveTextContent(DELETE_ACCOUNT_COPY.wrongPassword);
    const cleared = screen.getByLabelText("Password") as HTMLInputElement;
    expect(cleared.value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(cleared));
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ password: "wrong-secret", confirmEmail: "ada@example.com" });
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe("/api/auth/me");
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).not.toContain("wrong-secret");

    fireEvent.change(cleared, { target: { value: "still-here" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    openSheet();
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
  });

  it("shows Deleting… and ignores Escape and a second click while the request is in flight", async () => {
    renderAccount();
    openSheet();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.change(screen.getByLabelText(DELETE_ACCOUNT_COPY.emailLabel), {
      target: { value: "ada@example.com" },
    });
    let resolveFetch: (value: Response) => void = () => undefined;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    fireEvent.click(dialogConfirm());
    const pending = await screen.findByRole("button", { name: DELETE_ACCOUNT_COPY.pending });
    expect(pending).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(pending);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    resolveFetch({ status: 500, json: async () => ({ error: { message: "nope" } }) } as Response);
    expect(await screen.findByRole("alert")).toHaveTextContent(DELETE_ACCOUNT_COPY.failed);
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
  });

  it("navigates to the neutral deleted login after 204", async () => {
    renderAccount();
    openSheet();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.change(screen.getByLabelText(DELETE_ACCOUNT_COPY.emailLabel), {
      target: { value: "ada@example.com" },
    });
    vi.mocked(fetch).mockResolvedValue({ status: 204, json: async () => null } as Response);
    fireEvent.click(dialogConfirm());
    await screen.findByRole("button", { name: DELETE_ACCOUNT_COPY.pending });
    expect(nav.push).toHaveBeenCalledWith("/login?deleted=1");
  });

  it("shows the network copy when the request fails, and clears the password", async () => {
    renderAccount();
    openSheet();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.change(screen.getByLabelText(DELETE_ACCOUNT_COPY.emailLabel), {
      target: { value: "ada@example.com" },
    });
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    fireEvent.click(dialogConfirm());
    expect(await screen.findByRole("alert")).toHaveTextContent(DELETE_ACCOUNT_COPY.network);
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
  });

  it("disables the zone for an admin and does not open the sheet", () => {
    renderAccount({ isAdmin: true });
    const button = screen.getByRole("button", { name: "Delete account" });
    expect(button).toBeDisabled();
    expect(screen.getByText(DELETE_ACCOUNT_COPY.admin)).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks a Google-only account to sign in again until the session is fresh", () => {
    renderAccount({ hasPassword: false, sessionFresh: false });
    openSheet();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByLabelText(DELETE_ACCOUNT_COPY.emailLabel)).toBeNull();
    const link = screen.getByRole("link", { name: DELETE_ACCOUNT_COPY.googleCta });
    expect(link.getAttribute("href")).toContain("intent=reauth");
    expect(link.getAttribute("href")).toContain("delete%3D1");
    expect(link.getAttribute("href")).not.toContain("prompt=");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the email confirm for a fresh Google-only session and omits the password", () => {
    renderAccount({ hasPassword: false, sessionFresh: true });
    openSheet();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByRole("link", { name: DELETE_ACCOUNT_COPY.googleCta })).toBeNull();
    const confirm = dialogConfirm();
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(DELETE_ACCOUNT_COPY.emailLabel), {
      target: { value: "ADA@example.com" },
    });
    expect(confirm).toBeEnabled();
  });

  it("reopens the sheet from ?delete=1 only when the Google session is fresh, then strips the param", () => {
    nav.params = new URLSearchParams("delete=1");
    renderAccount({ hasPassword: false, sessionFresh: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText(DELETE_ACCOUNT_COPY.emailLabel) as HTMLInputElement).value).toBe("");
    expect(nav.replace).toHaveBeenCalledWith("/app/account");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not reopen the sheet from ?delete=1 when the session is stale", () => {
    nav.params = new URLSearchParams("delete=1");
    renderAccount({ hasPassword: false, sessionFresh: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(DELETE_ACCOUNT_COPY.reauthRequired);
    expect(nav.replace).toHaveBeenCalledWith("/app/account");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a neutral note for ?reauth=stale, keeps the sheet closed, and starts Google from Delete account", () => {
    nav.params = new URLSearchParams("reauth=stale");
    renderAccount({ hasPassword: false, sessionFresh: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent(DELETE_ACCOUNT_COPY.reauthStale);
    expect(note.className).toContain("bg-canvas-2");
    expect(note.className).not.toContain("danger");
    const restart = screen.getByRole("link", { name: "Delete account" });
    expect(restart.getAttribute("href")).toBe(GOOGLE_REAUTH_HREF);
    expect(nav.replace).toHaveBeenCalledWith("/app/account");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not reopen the sheet from ?delete=1 for a password account or an admin", () => {
    nav.params = new URLSearchParams("delete=1");
    const { unmount } = render(
      <AccountSettings
        email="Ada@Example.com"
        methods={passwordMethods}
        isAdmin={false}
        sessionFresh
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    nav.params = new URLSearchParams("delete=1");
    renderAccount({ isAdmin: true, hasPassword: false, sessionFresh: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

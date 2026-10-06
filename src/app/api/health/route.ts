import { oauthStateSecretConfigured } from "@/lib/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV === "production" && !oauthStateSecretConfigured()) {
    return Response.json({ ok: false, error: "OAUTH_STATE_SECRET missing" }, { status: 503 });
  }
  return Response.json({ ok: true });
}

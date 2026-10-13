import { describe, expect, it } from "vitest";
import { requestIdFrom } from "@/lib/request-id";

function req(id?: string): Request {
  const headers = new Headers();
  if (id !== undefined) headers.set("x-request-id", id);
  return new Request("http://test/", { headers });
}

describe("requestIdFrom", () => {
  it("keeps a safe inbound id and replaces anything else", () => {
    expect(requestIdFrom(req("req-219"))).toBe("req-219");
    expect(requestIdFrom(req("bad id"))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(requestIdFrom(req())).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
